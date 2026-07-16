import { workflow, node, trigger, ifElse, expr } from '@n8n/workflow-sdk';

const receiveAction = trigger({
  type: 'n8n-nodes-base.webhook',
  version: 2.1,
  config: {
    name: 'Receive Operations Action',
    parameters: {
      httpMethod: 'POST',
      path: 'agra-operations-action',
      authentication: 'none',
      responseMode: 'responseNode',
      options: { allowedOrigins: '*' },
    },
    position: [160, 300],
  },
});

const normalizeRequest = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Normalize Request',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const input = $input.first()?.json ?? {};
const body = input.body && typeof input.body === 'object' && !Array.isArray(input.body) ? input.body : {};
const authorization = String(input.headers?.authorization ?? input.headers?.Authorization ?? '');
const accessToken = authorization.replace(/^Bearer\\s+/i, '').trim();
const requestId = String(body.requestId ?? body.request_id ?? '').trim();
const action = String(body.action ?? '').trim().toUpperCase();
const orderId = body.orderId ?? body.order_id ?? null;
const payload = body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload) ? body.payload : {};
const allowedActions = new Set(['CREATE_CUSTOMER','CREATE_PRODUCT','RECEIVE_BATCH','INSPECT_BATCH','UPDATE_PROFILE','CREATE_ORDER','RESET_DEMO','UPDATE_DRAFT_ORDER','SUBMIT_ORDER','CHECK_STOCK','RECORD_PRODUCTION','APPROVE_ORDER','START_PICKING','COMPLETE_PICKING','RECORD_QC','COMPLETE_REWORK','COMPLETE_PACKING','VERIFY_DOCUMENTS','CONFIRM_HANDOVER','CANCEL_ORDER','RESOLVE_EXCEPTION']);
const errors = [];
if (!accessToken) errors.push('Sign in is required.');
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) errors.push('A valid request ID is required.');
if (!allowedActions.has(action)) errors.push('This action is not supported.');
if (orderId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(orderId))) errors.push('The order ID is not valid.');
return [{ json: { valid: errors.length === 0, errors, accessToken, requestId, action, orderId, payload } }];`,
    },
    position: [400, 300],
  },
});

const requestIsValid = ifElse({
  version: 2.3,
  config: {
    name: 'Request Is Valid',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          leftValue: expr('{{ $json.valid }}'),
          operator: { type: 'boolean', operation: 'true', singleValue: true },
          rightValue: '',
        }],
        combinator: 'and',
      },
    },
    position: [640, 300],
  },
});

const verifyUser = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Verify Supabase User',
    parameters: {
      method: 'GET',
      url: 'https://etykyasaicfhrbbtbdfv.supabase.co/auth/v1/user',
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: 'sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5' },
        { name: 'Authorization', value: expr('{{ "Bearer " + $json.accessToken }}') },
        { name: 'Accept', value: 'application/json' },
      ] },
      options: {
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
        timeout: 10000,
      },
    },
    position: [880, 180],
  },
});

const evaluateAuth = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Evaluate User',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const response = $input.first()?.json ?? {};
const request = $('Normalize Request').first().json;
const statusCode = Number(response.statusCode ?? 0);
const user = response.body ?? {};
const authorized = statusCode >= 200 && statusCode < 300 && Boolean(user.id);
return [{ json: { ...request, authorized, authStatusCode: statusCode, userId: user.id ?? null } }];`,
    },
    position: [1120, 180],
  },
});

const userIsAuthorized = ifElse({
  version: 2.3,
  config: {
    name: 'User Is Authorized',
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
        conditions: [{
          leftValue: expr('{{ $json.authorized }}'),
          operator: { type: 'boolean', operation: 'true', singleValue: true },
          rightValue: '',
        }],
        combinator: 'and',
      },
    },
    position: [1360, 180],
  },
});

const executeAction = node({
  type: 'n8n-nodes-base.httpRequest',
  version: 4.4,
  config: {
    name: 'Execute Transaction',
    parameters: {
      method: 'POST',
      url: 'https://etykyasaicfhrbbtbdfv.supabase.co/rest/v1/rpc/agra_execute_action',
      authentication: 'none',
      sendHeaders: true,
      specifyHeaders: 'keypair',
      headerParameters: { parameters: [
        { name: 'apikey', value: 'sb_publishable_9CUzPDO-Ep08eZUihvGuYA_0smOgJA5' },
        { name: 'Authorization', value: expr('{{ "Bearer " + $json.accessToken }}') },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'Accept', value: 'application/json' },
      ] },
      sendBody: true,
      contentType: 'json',
      specifyBody: 'json',
      jsonBody: expr('{{ ({ p_request_id: $json.requestId, p_action: $json.action, p_order_id: $json.orderId || null, p_payload: { ...$json.payload, source: "N8N" } }) }}'),
      options: {
        response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } },
        timeout: 20000,
      },
    },
    position: [1600, 80],
  },
});

const formatResult = node({
  type: 'n8n-nodes-base.code',
  version: 2,
  config: {
    name: 'Format Result',
    parameters: {
      mode: 'runOnceForAllItems',
      language: 'javaScript',
      jsCode: `const rpc = $input.first()?.json ?? {};
const statusCode = Number(rpc.statusCode ?? 500);
const body = rpc.body ?? rpc;
if (statusCode >= 200 && statusCode < 300) return [{ json: { statusCode, response: body } }];
const message = body?.message ?? body?.error_description ?? 'The operation could not be completed.';
return [{ json: { statusCode: statusCode >= 400 && statusCode < 600 ? statusCode : 500, response: { ok: false, code: body?.code ?? 'OPERATION_FAILED', message, details: body?.details ?? null } } }];`,
    },
    position: [1840, 80],
  },
});

const respondSuccess = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Result',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ $json.response }}'),
      options: {
        responseCode: expr('{{ $json.statusCode }}'),
        responseHeaders: { entries: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'no-store' },
        ] },
      },
    },
    position: [2080, 80],
  },
});

const respondInvalid = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Invalid Request',
    parameters: {
      respondWith: 'json',
      responseBody: expr('{{ ({ ok: false, code: "INVALID_REQUEST", message: $json.errors[0] || "The request is invalid.", errors: $json.errors }) }}'),
      options: {
        responseCode: 400,
        responseHeaders: { entries: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'no-store' },
        ] },
      },
    },
    position: [880, 440],
  },
});

const respondUnauthorized = node({
  type: 'n8n-nodes-base.respondToWebhook',
  version: 1.5,
  config: {
    name: 'Return Sign In Required',
    parameters: {
      respondWith: 'json',
      responseBody: '{ "ok": false, "code": "AUTH_REQUIRED", "message": "Your session has expired. Please sign in again." }',
      options: {
        responseCode: 401,
        responseHeaders: { entries: [
          { name: 'Access-Control-Allow-Origin', value: '*' },
          { name: 'Cache-Control', value: 'no-store' },
        ] },
      },
    },
    position: [1600, 300],
  },
});

export default workflow('agra-operations-action', 'Agra - Operations Action Gateway')
  .add(receiveAction)
  .to(normalizeRequest)
  .to(requestIsValid
    .onTrue(verifyUser.to(evaluateAuth).to(userIsAuthorized
      .onTrue(executeAction.to(formatResult).to(respondSuccess))
      .onFalse(respondUnauthorized)))
    .onFalse(respondInvalid));
