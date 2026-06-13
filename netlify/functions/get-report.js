const { getStore } = require('@netlify/blobs');

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=86400',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  const id = event.queryStringParameters && event.queryStringParameters.id;
  if (!id || !/^[a-z0-9]{5,10}$/.test(id)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid id' }) };
  }

  const store = getStore('reports');
  const data = await store.get(id);

  if (!data) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
  }

  return { statusCode: 200, headers, body: data };
};
