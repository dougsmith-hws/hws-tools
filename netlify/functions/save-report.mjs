import { getStore } from "@netlify/blobs";

const CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function makeId(len) {
  let id = '';
  for (let i = 0; i < len; i++) id += CHARS[Math.floor(Math.random() * CHARS.length)];
  return id;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS });
  }

  let payload;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response('Invalid JSON', { status: 400, headers: CORS });
  }

  const id = makeId(7);
  const store = getStore('reports');
  await store.set(id, JSON.stringify({ ...payload, created: new Date().toISOString() }));

  return new Response(
    JSON.stringify({ id, url: `https://tools.homewealthsolutions.com/r/${id}` }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } }
  );
};
