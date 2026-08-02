import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUserGlobalSignOutCommand,
  InitiateAuthCommand,
  ForgotPasswordCommand,
  ConfirmForgotPasswordCommand,
  RespondToAuthChallengeCommand,
  GetUserCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import { cognitoConfig } from './cognitoConfig.js';

const clientConfig = {
  region: cognitoConfig.region,
};

if (cognitoConfig.accessKeyId && cognitoConfig.secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId: cognitoConfig.accessKeyId,
    secretAccessKey: cognitoConfig.secretAccessKey,
  };
}

export const cognitoClient = new CognitoIdentityProviderClient(clientConfig);

export const idTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId,
  tokenUse: 'id',
  clientId: cognitoConfig.clientId,
});

export const accessTokenVerifier = CognitoJwtVerifier.create({
  userPoolId: cognitoConfig.userPoolId,
  tokenUse: 'access',
  clientId: cognitoConfig.clientId,
});

function attrMap(userAttributes = []) {
  const map = {};
  for (const attr of userAttributes) {
    map[attr.Name] = attr.Value;
  }
  return map;
}

export function parseCognitoUser(user) {
  const attributes = attrMap(user.UserAttributes || user.Attributes || []);
  return {
    username: user.Username,
    sub: attributes.sub || user.Username,
    email: attributes.email || '',
    name: attributes.name || '',
    emailVerified: attributes.email_verified === 'true',
    role: attributes['custom:role'] || '',
    legacyFirebaseUid: attributes['custom:legacyFirebaseUid'] || '',
    parentRecruiterId: attributes['custom:parentRecruiterId'] || '',
    teamId: attributes['custom:teamId'] || '',
    enabled: user.Enabled !== false,
    status: user.UserStatus,
    attributes,
  };
}

export async function initiatePasswordAuth(email, password) {
  const response = await cognitoClient.send(
    new InitiateAuthCommand({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: cognitoConfig.clientId,
      AuthParameters: {
        USERNAME: email,
        PASSWORD: password,
      },
    })
  );
  return response;
}

export async function respondToNewPasswordChallenge(email, newPassword, session) {
  return cognitoClient.send(
    new RespondToAuthChallengeCommand({
      ClientId: cognitoConfig.clientId,
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      Session: session,
      ChallengeResponses: {
        USERNAME: email,
        NEW_PASSWORD: newPassword,
      },
    })
  );
}

export async function refreshAuth(refreshToken) {
  return cognitoClient.send(
    new InitiateAuthCommand({
      AuthFlow: 'REFRESH_TOKEN_AUTH',
      ClientId: cognitoConfig.clientId,
      AuthParameters: {
        REFRESH_TOKEN: refreshToken,
      },
    })
  );
}

export async function forgotPassword(email) {
  return cognitoClient.send(
    new ForgotPasswordCommand({
      ClientId: cognitoConfig.clientId,
      Username: email,
    })
  );
}

export async function confirmForgotPassword(email, code, newPassword) {
  return cognitoClient.send(
    new ConfirmForgotPasswordCommand({
      ClientId: cognitoConfig.clientId,
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    })
  );
}

export async function getUserFromAccessToken(accessToken) {
  const response = await cognitoClient.send(
    new GetUserCommand({ AccessToken: accessToken })
  );
  return parseCognitoUser(response);
}

export async function adminGetUserByEmail(email) {
  const listed = await cognitoClient.send(
    new ListUsersCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Filter: `email = "${email.replace(/"/g, '')}"`,
      Limit: 1,
    })
  );
  if (!listed.Users?.length) return null;
  const detailed = await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Username: listed.Users[0].Username,
    })
  );
  return parseCognitoUser(detailed);
}

export async function adminCreateUser({
  email,
  temporaryPassword,
  permanentPassword,
  name,
  role,
  legacyFirebaseUid,
  parentRecruiterId,
  teamId,
  suppressMessage = true,
}) {
  const userAttributes = [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'custom:role', Value: role },
  ];
  if (name) userAttributes.push({ Name: 'name', Value: name });
  if (legacyFirebaseUid) {
    userAttributes.push({ Name: 'custom:legacyFirebaseUid', Value: legacyFirebaseUid });
  }
  if (parentRecruiterId) {
    userAttributes.push({ Name: 'custom:parentRecruiterId', Value: parentRecruiterId });
  }
  if (teamId) {
    userAttributes.push({ Name: 'custom:teamId', Value: teamId });
  }

  const created = await cognitoClient.send(
    new AdminCreateUserCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Username: email,
      TemporaryPassword: temporaryPassword || permanentPassword,
      MessageAction: suppressMessage ? 'SUPPRESS' : undefined,
      UserAttributes: userAttributes,
      DesiredDeliveryMediums: suppressMessage ? undefined : ['EMAIL'],
    })
  );

  const passwordToSet = permanentPassword || temporaryPassword;
  if (passwordToSet) {
    await cognitoClient.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: cognitoConfig.userPoolId,
        Username: email,
        Password: passwordToSet,
        Permanent: Boolean(permanentPassword) || !temporaryPassword,
      })
    );
  }

  if (role === 'admin' || role === 'recruiter' || role === 'candidate') {
    await cognitoClient.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: cognitoConfig.userPoolId,
        Username: email,
        GroupName: role,
      })
    );
  }

  const user = parseCognitoUser(created.User || (await cognitoClient.send(
    new AdminGetUserCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Username: email,
    })
  )));

  return user;
}

export async function adminUpdateCustomAttributes(username, attributes) {
  const userAttributes = Object.entries(attributes)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([Name, Value]) => ({ Name, Value: String(Value) }));

  if (!userAttributes.length) return;

  await cognitoClient.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Username: username,
      UserAttributes: userAttributes,
    })
  );
}

export async function adminSetEnabled(username, enabled) {
  const Command = enabled ? AdminEnableUserCommand : AdminDisableUserCommand;
  await cognitoClient.send(
    new Command({
      UserPoolId: cognitoConfig.userPoolId,
      Username: username,
    })
  );
}

export async function adminGlobalSignOut(username) {
  await cognitoClient.send(
    new AdminUserGlobalSignOutCommand({
      UserPoolId: cognitoConfig.userPoolId,
      Username: username,
    })
  );
}

export async function verifyIdToken(token) {
  return idTokenVerifier.verify(token);
}

export async function verifyAccessToken(token) {
  return accessTokenVerifier.verify(token);
}
