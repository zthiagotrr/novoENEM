const { createClient } = require('@supabase/supabase-js');

// Inicializar Supabase se as variáveis existirem
let supabase = null;
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
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

  try {
    const { nome, cpf } = JSON.parse(event.body || '{}');
    
    if (!nome || !cpf) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ message: 'Nome e CPF são obrigatórios.' })
      };
    }

    const response = await fetch('https://api.gothampaybr.com/api/v1/pix/cashin', {
      method: 'POST',
      headers: {
        'X-Client-Id': process.env.GOTHAM_CLIENT_ID,
        'X-Client-Secret': process.env.GOTHAM_CLIENT_SECRET,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        nome,
        cpf,
        valor: 85,
        descricao: 'Caderno Falante'
      })
    });

    const data = await response.json();

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
      body: JSON.stringify({ message: 'Erro ao gerar PIX.' })
    };
  }
};