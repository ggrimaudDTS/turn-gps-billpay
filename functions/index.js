import { initializeApp } from 'firebase-admin/app';
import { debug } from 'firebase-functions/logger';
import * as v1 from "firebase-functions";
import {https, setGlobalOptions} from 'firebase-functions/v2';
import {expressServer} from "./https/graphql/server.js";

initializeApp();

const vpc = 'projects/ut-dts-shared-vpc-dev/locations/us-central1/connectors/dts-shared-vpc-connector'
const vpcEgress = 'ALL_TRAFFIC';
const serviceAccount = 'firebase-function-v2-sa@ut-dts-agrc-turn-gps-dev.iam.gserviceaccount.com';
setGlobalOptions({ serviceAccount: serviceAccount, vpcConnector: vpc, vpcConnectorEgressSettings: vpcEgress });

// auth
export const onCreateUser = v1
  .runWith({
    vpcConnector: vpc,
    vpcConnectorEgressSettings: vpcEgress,
    serviceAccount: serviceAccount,
  })
  .auth.user().onCreate(async (user) => {
    debug('[auth::user::onCreate] importing createUser');
    const createUser = (await import('./auth/onCreate.js')).createUser;
  
    const result = await createUser(user);
  
    debug('[auth::user::onCreate]', result);
  
    return result;
});

// functions
export const getProfile = https.onCall(
  { cors: [/ut-dts-agrc-turn-gps-dev\.firebaseapp\.com$/, "/utah\.gov"] }, 
  async (request) => {
    if (request.auth === undefined) {
      debug('[https::getProfile] no auth context');

      throw new https.HttpsError(
        https.FunctionsErrorCode.UNAUTHENTICATED,
        'unauthenticated'
      );
    }

    debug('[https::getProfile] importing createKey');
    const getProfile = (await import('./https/getProfile.js')).getProfile;

    const result = await getProfile(request.auth);

    debug('[https::getProfile]', result);

    return result;
  }
);

export const paymentCallBack = https.onRequest({ secrets: ["database"] },
  async (request, response) => {

    debug('[https::paymentCallback] importing createKey');
    const paymentCallback = (await import('./https/paymentCallback.js')).paymentCallback;

    const result = await paymentCallback(request, response);

    debug('[https::paymentCallback]', result);

    return result;
  }
);

export const graphQl = https.onRequest({ secrets: ["database"] },expressServer);

if (process.env.LOCAL) {
  const port = process.env.PORT || process.env.GRAPHQL_PORT;
  expressServer.listen(port);
  console.log('🚀🙂😀😃 Server is running on:' + ' ' + `http://localhost:${process.env.GRAPHQL_PORT}`);
}