-- Script SQL para criar as tabelas necessárias no Supabase
-- Execute este script no SQL Editor do Supabase

-- 1. Tabela de agendamentos (melhorada)
CREATE TABLE IF NOT EXISTS agendamentos (
    id BIGSERIAL PRIMARY KEY,
    telefone VARCHAR(20) NOT NULL,
    nome_cliente VARCHAR(100) NOT NULL,
    servico VARCHAR(50) NOT NULL,
    data_horario TIMESTAMP WITH TIME ZONE NOT NULL,
    horario_inicio TIME NOT NULL,
    horario_fim TIME NOT NULL,
    preco DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'agendado' CHECK (status IN ('agendado', 'confirmado', 'cancelado', 'concluido')),
    observacoes TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    cancelado_em TIMESTAMP WITH TIME ZONE
);

-- 2. Tabela de logs de atendimento
CREATE TABLE IF NOT EXISTS logs_atendimento (
    id BIGSERIAL PRIMARY KEY,
    telefone VARCHAR(20) NOT NULL,
    nome_contato VARCHAR(100),
    mensagem_recebida TEXT NOT NULL,
    resposta_enviada TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status VARCHAR(20) DEFAULT 'processado',
    duracao_processamento INTEGER, -- em milissegundos
    erro TEXT
);

-- 3. Tabela de configurações da barbearia
CREATE TABLE IF NOT EXISTS config_barbearia (
    id BIGSERIAL PRIMARY KEY,
    chave VARCHAR(50) UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    descricao TEXT,
    criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Inserir configurações padrão
INSERT INTO config_barbearia (chave, valor, descricao) VALUES
('horario_funcionamento', '{"terca":"09:00-19:00","quarta":"09:00-19:00","quinta":"09:00-19:00","sexta":"08:00-19:00","sabado":"08:00-17:00","domingo":"fechado","segunda":"fechado"}', 'Horários de funcionamento por dia da semana'),
('servicos_precos', '{"corte":30.00,"corte_maquina":25.00,"barba":20.00,"pezinho":15.00,"sobrancelha":20.00,"relaxamento":20.00,"tintura":20.00,"luzes":50.00,"platinado":90.00,"combo":65.00}', 'Preços dos serviços'),
('duracao_servicos', '{"corte":30,"corte_maquina":30,"barba":30,"pezinho":15,"sobrancelha":15,"relaxamento":45,"tintura":60,"luzes":90,"platinado":120,"combo":90}', 'Duração dos serviços em minutos'),
('intervalo_agendamentos', '15', 'Intervalo mínimo entre agendamentos em minutos'),
('nome_barbearia', 'Barbearia do Jão', 'Nome da barbearia'),
('telefone_barbearia', '11999999999', 'Telefone da barbearia')
ON CONFLICT (chave) DO NOTHING;

-- 5. Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_agendamentos_telefone ON agendamentos(telefone);
CREATE INDEX IF NOT EXISTS idx_agendamentos_data_horario ON agendamentos(data_horario);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);
CREATE INDEX IF NOT EXISTS idx_logs_telefone ON logs_atendimento(telefone);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON logs_atendimento(timestamp);

-- 6. Função para verificar conflitos de horário
CREATE OR REPLACE FUNCTION verificar_conflito_horario(
    p_data_horario TIMESTAMP WITH TIME ZONE,
    p_horario_inicio TIME,
    p_horario_fim TIME,
    p_agendamento_id BIGINT DEFAULT NULL
) RETURNS BOOLEAN AS $$
DECLARE
    conflito_count INTEGER;
BEGIN
    SELECT COUNT(*)
    INTO conflito_count
    FROM agendamentos
    WHERE DATE(data_horario) = DATE(p_data_horario)
    AND status IN ('agendado', 'confirmado')
    AND (p_agendamento_id IS NULL OR id != p_agendamento_id)
    AND (
        (horario_inicio <= p_horario_inicio AND horario_fim > p_horario_inicio) OR
        (horario_inicio < p_horario_fim AND horario_fim >= p_horario_fim) OR
        (horario_inicio >= p_horario_inicio AND horario_fim <= p_horario_fim)
    );
    
    RETURN conflito_count > 0;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger para atualizar timestamp de atualização
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_agendamentos_updated_at
    BEFORE UPDATE ON agendamentos
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_config_updated_at
    BEFORE UPDATE ON config_barbearia
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 8. Políticas RLS (Row Level Security) - opcional
-- ALTER TABLE agendamentos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE logs_atendimento ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE config_barbearia ENABLE ROW LEVEL SECURITY;

-- 9. View para relatórios
CREATE OR REPLACE VIEW vw_agendamentos_hoje AS
SELECT 
    a.*,
    EXTRACT(HOUR FROM horario_inicio) as hora_inicio,
    EXTRACT(MINUTE FROM horario_inicio) as minuto_inicio
FROM agendamentos a
WHERE DATE(data_horario) = CURRENT_DATE
AND status IN ('agendado', 'confirmado')
ORDER BY horario_inicio;

-- 10. View para estatísticas
CREATE OR REPLACE VIEW vw_estatisticas_atendimento AS
SELECT 
    DATE(timestamp) as data,
    COUNT(*) as total_mensagens,
    COUNT(CASE WHEN resposta_enviada IS NOT NULL THEN 1 END) as mensagens_respondidas,
    AVG(duracao_processamento) as tempo_medio_resposta
FROM logs_atendimento
GROUP BY DATE(timestamp)
ORDER BY data DESC;