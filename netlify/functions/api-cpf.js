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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // Apenas GET permitido
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ success: false, erro: 'Método não permitido.' })
    };
  }

  const cpfLimpo = (event.queryStringParameters?.cpf || '').replace(/\D/g, '');
  if (cpfLimpo.length !== 11) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ success: false, erro: 'CPF inválido.' })
    };
  }

  try {
    const url = `https://magmadatahub.com/api.php?token=${process.env.CPF_API_TOKEN}&cpf=${cpfLimpo}`;
    const response = await fetch(url);

    if (!response.ok) {
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({ success: false, erro: 'Erro na base externa.' })
      };
    }

    const data = await response.json();

    // Salvar no Supabase se configurado
    if (supabase && data.nome) {
      await supabase.from('leads').upsert(
        { cpf: cpfLimpo, nome: data.nome, nascimento: data.nascimento || null },
        { onConflict: 'cpf' }
      );
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };
  } catch (err) {
    console.error('[CPF]', err.message);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ success: false, erro: 'Erro ao consultar CPF.' })
    };
  }
};