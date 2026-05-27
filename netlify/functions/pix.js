const { createClient } = require('@supabase/supabase-js');
const https = require('https');

// Inicializar Supabase se as variáveis existirem
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
}

// Helper para fazer requisições POST HTTP via módulo nativo 'https'
function requestPost(url, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json: () => {
            try {
              return Promise.resolve(JSON.parse(data));
            } catch (e) {
              return Promise.reject(new Error('JSON inválido retornado pela API de pagamento.'));
            }
          }
        });
      });
    });

    req.on('error', (err) => {
      reject(err);
    });
    req.write(body);
    req.end();
  });
}

exports.handler = async (event, context) => {
  // Permitir CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Lidar com preflight requests
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // Apenas POST permitido
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ message: 'Método não permitido.' })
    };
  }

  // Verificar chaves da GothamPay
  if (!process.env.GOTHAM_CLIENT_ID || !process.env.GOTHAM_CLIENT_SECRET) {
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ message: 'Credenciais GothamPay não configuradas no Netlify.' })
    };
  }

  try {
    const { nome, cpf } = JSON.parse(event.body || '{}');
    
    if (!nome || !cpf) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Nome e CPF são obrigatórios.' })
      };
    }

    const postHeaders = {
      'X-Client-Id': process.env.GOTHAM_CLIENT_ID,
      'X-Client-Secret': process.env.GOTHAM_CLIENT_SECRET
    };

    const postBody = JSON.stringify({
      nome,
      cpf,
      valor: 85,
      descricao: 'Caderno Falante'
    });

    const response = await requestPost(
      'https://api.gothampaybr.com/api/v1/pix/cashin',
      postHeaders,
      postBody
    );

    const data = await response.json();

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ message: data.message || 'Erro ao gerar PIX.' })
      };
    }

    // Salvar no Supabase se configurado
    if (supabase && data.id) {
      await supabase.from('pagamentos').insert({
        gotham_id: data.id,
        nome,
        cpf,
        valor: 85,
        status: data.status,
        qr_code_text: data.qr_code_text,
        expires_at: data.expires_at || null
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('[PIX]', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ message: 'Erro ao gerar PIX: ' + err.message })
    };
  }
};