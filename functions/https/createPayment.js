/* eslint-disable no-param-reassign */
/* eslint-disable no-restricted-syntax */
import { auth, https, logger } from 'firebase-functions/v1';
import { v4 as uuidv4 } from 'uuid';
import { error, info } from 'firebase-functions/logger';
import axios from 'axios';
import setupFirebase from '../firebase.js';
import { insertOrder, insertOrderItem } from '../db/service/databaseService.js';

setupFirebase();

function convertJsonToFormData(dataObj) {
  const formData = new FormData();
  Object.entries(dataObj).forEach(([key, value]) => {
    formData.append(key, value);
  });

  return formData;
}

function buildOrder(data, uuid, govPayToken) {
  const totalPrice = data.reduce((accumulator, currentValue) => accumulator + currentValue.contractPrice, 0);
  return {
    uuid,
    orgId: data[0].organizationId,
    userId: data[0].userId, // maybe use the auth users userid
    totalPrice,
    govPayToken,
  };
}

async function insertOrderItemsAsync(data, orderId) {
  const results = [];
  for (const item of data) {
    item.orderId = orderId;
    results.push(insertOrderItem(item));
  }
  await Promise.all(results);
}

export const createPayment = async (request) => {
  if (!request.auth) {
    info('unauthenticated request', { structuredData: true });
    throw new auth.HttpsError('unauthenticated', 'You must log in');
  }
  if (!request.data?.length) {
    info('no data in request', { structuredData: true });
    throw new auth.HttpsError('failed-precondition', 'You must post data');
  }
  logger.info('authData email', request.auth.token.email);
  const { data } = request;
  logger.info('data', data);

  const orderNumber = uuidv4();
  const govPayResult = await govPayPostCall(request.data, orderNumber);
  if (govPayResult?.status === 200) {
    const orderToken = govPayResult?.data;
    console.log('orderToken', orderToken);

    // insert order
    const orderResult = await insertOrder(buildOrder(data, orderNumber, orderToken));

    // insert order items
    const orderId = orderResult[0].id;
    await insertOrderItemsAsync(data, orderId);

    return orderToken;
  }
  error('[createPayment :: govPayPostCall]', govPayResult);
  throw new https.HttpsError('internal', `${govPayResult.status} : ${govPayResult.statusText}`);
};

async function govPayPostCall(requestData, orderNumber) {
  // prod api_key ?
  // prod https://secure.utah.gov/govpay
  const apiKey = 'tngps_user';
  const url = 'https://stage.utah.gov/govpay/checkout/createOrder.html';
  // const url = 'https://stage.utah.gov/govpay/checkout/order.html?TOKEN=3AAYF0YRD0YYZS05SU9QOBKN00GEWCRH';

  const orderObj = {
    API_KEY: apiKey,
    ORDER_NUMBER: orderNumber,
  };

  const jsonOrderObj = requestData.reduce((accumulator, currentValue, index) => {
    const count = index + 1;
    accumulator[`ITEM_${count}`] = currentValue.loginName;
    accumulator[`ITEM_DESC_${count}`] = currentValue.contractName;
    accumulator[`ITEM_AMT_${count}`] = currentValue.contractPrice;
    accumulator[`ITEM_QTY_${count}`] = 1;
    return accumulator;
  }, {});

  const newObj = { ...jsonOrderObj, ...orderObj };
  console.log('userObj', newObj);

  const formData = convertJsonToFormData(newObj);

  return axios.post(url, formData);
}