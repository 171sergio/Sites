// Configuração do Supabase
let supabaseClient = null;
let isSupabaseConfigured = false;

// Verificar se as configurações do Supabase estão disponíveis
if (typeof SUPABASE_CONFIG !== 'undefined' && 
    SUPABASE_CONFIG.url && 
    SUPABASE_CONFIG.anonKey &&
    SUPABASE_CONFIG.url !== 'https://your-project-ref.supabase.co' &&
    SUPABASE_CONFIG.anonKey !== 'your-anon-key-here') {
    
    try {
        // Verificar se a biblioteca Supabase foi carregada
        if (typeof supabase !== 'undefined' && supabase.createClient) {
            const { createClient } = supabase;
            supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
            isSupabaseConfigured = true;
            console.log('✅ Supabase configurado com sucesso!');
        } else {
            throw new Error('Biblioteca Supabase não carregada');
        }
    } catch (error) {
        console.error('❌ Erro ao configurar Supabase:', error);
        alert('❌ Erro: Supabase não configurado corretamente. Verifique o arquivo config.js');
        isSupabaseConfigured = false;
        supabaseClient = null;
    }
} else {
    alert('❌ Erro: Supabase não configurado. Configure o arquivo config.js para usar o sistema.');
    console.error('❌ Supabase não configurado. Configure o arquivo config.js');
    isSupabaseConfigured = false;
}

// Estado da aplicação
let currentUser = null;
let currentSection = 'overview';
let clients = [];
let services = [];
let appointments = [];
let todayAppointments = [];

// Cache para dados do banco
const dataCache = new Map();
const clientsCache = new Map();
const servicesCache = new Map();

// Função para carregar serviços do banco
async function loadServices() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar serviços');
        return [];
    }

    try {
        const { data, error } = await supabaseClient
            .from('servicos')
            .select('*')
            .eq('ativo', true)
            .order('categoria', { ascending: true });

        if (error) throw error;
        
        services = data || [];
        
        // Atualizar cache
        services.forEach(service => {
            servicesCache.set(service.id, service);
        });
        
        return services;
    } catch (error) {
        console.error('Erro ao carregar serviços:', error);
        return [];
    }
}

// Função para buscar ou criar cliente
async function findOrCreateClient(telefone, nome) {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível buscar/criar cliente');
        throw new Error('Supabase não configurado');
    }

    const normalizedPhone = normalizePhone(telefone);
    console.log('🔍 Buscando cliente:', { telefone, nome, normalizedPhone });
    
    try {
        // Primeiro, tentar encontrar cliente existente
        const { data: existingClient, error: searchError } = await supabaseClient
            .from('clientes')
            .select('*')
            .eq('telefone', normalizedPhone)
            .single();

        if (searchError && searchError.code !== 'PGRST116') {
            console.error('❌ Erro na busca do cliente:', searchError);
            throw searchError;
        }

        if (existingClient) {
            console.log('✅ Cliente existente encontrado:', existingClient);
            // Cliente encontrado, atualizar cache
            clientsCache.set(existingClient.id, existingClient);
            return existingClient;
        }

        // Cliente não encontrado, criar novo
        console.log('🆕 Criando novo cliente...');
        const { data: newClient, error: createError } = await supabaseClient
            .from('clientes')
            .insert([{
                telefone: normalizedPhone,
                nome: nome,
                status_cliente: 'ativo'
            }])
            .select()
            .single();

        if (createError) {
            console.error('❌ Erro ao criar cliente:', createError);
            throw createError;
        }

        console.log('✅ Novo cliente criado:', newClient);
        // Adicionar ao cache
        clientsCache.set(newClient.id, newClient);
        
        return newClient;
    } catch (error) {
        console.error('❌ Erro ao buscar/criar cliente:', error);
        throw error;
    }
}

// Função utilitária para calcular horário de fim
function calculateEndTime(startTime, durationMinutes = 30) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hours, minutes + durationMinutes, 0, 0);
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    return `${endHours}:${endMinutes}`;
}

// Função legada removida - usar checkTimeConflictSupabase

// Função utilitária para debounce (melhora performance em buscas)
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Função para cache simples de dados
// Remove duplicate dataCache declaration since it's already declared at the top
function getCachedData(key, fetchFunction, ttl = 300000) { // 5 minutos de cache
    const cached = dataCache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
        return Promise.resolve(cached.data);
    }
    
    return fetchFunction().then(data => {
        dataCache.set(key, { data, timestamp: Date.now() });
        return data;
    });
}

// Função para limpar cache
function clearCache(key = null) {
    if (key) {
        dataCache.delete(key);
    } else {
        dataCache.clear();
    }
}

// Função para verificar conflitos no Supabase
async function checkTimeConflictSupabase(date, startTime, endTime, excludeId = null) {
    if (!supabaseClient) return { conflict: false };
    
    try {
        let query = supabaseClient
            .from('vw_agendamentos_completos')
            .select('id, cliente_nome, horario_inicio, horario_fim')
            .gte('data_horario', `${date}T00:00:00`)
            .lte('data_horario', `${date}T23:59:59`);
        
        if (excludeId) {
            query = query.neq('id', excludeId);
        }
        
        const { data: existingAppointments, error } = await query;
        
        if (error) throw error;
        
        for (const apt of existingAppointments || []) {
            const aptStart = apt.horario_inicio;
            const aptEnd = apt.horario_fim;
            
            // Verificar sobreposição de horários
            if (
                (startTime >= aptStart && startTime < aptEnd) || // Início dentro do agendamento existente
                (endTime > aptStart && endTime <= aptEnd) ||     // Fim dentro do agendamento existente
                (startTime <= aptStart && endTime >= aptEnd)     // Agendamento novo engloba o existente
            ) {
                return {
                    conflict: true,
                    conflictWith: {
                        ...apt,
                        nome_cliente: apt.cliente_nome
                    }
                };
            }
        }
        
        return { conflict: false };
    } catch (error) {
        console.error('Erro ao verificar conflitos:', error);
        return { conflict: false };
    }
}

// Função de teste para verificar a view
async function testViewData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🧪 Testando view vw_agendamentos_completos...');
        
        const { data, error } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .limit(5);
        
        if (error) {
            console.error('❌ Erro na view:', error);
            return;
        }
        
        console.log('✅ Dados da view:', data);
        
        // Testar também as tabelas individuais
        const { data: agendamentos } = await supabaseClient
            .from('agendamentos')
            .select('*')
            .limit(3);
        
        const { data: clientes } = await supabaseClient
            .from('clientes')
            .select('*')
            .limit(3);
        
        console.log('📊 Agendamentos diretos:', agendamentos);
        console.log('👥 Clientes diretos:', clientes);
        
    } catch (error) {
        console.error('❌ Erro no teste:', error);
    }
}

// Função para comparar dados entre loadAppointments e loadTodayAppointments
async function compareAppointmentData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🔍 Comparando dados entre loadAppointments e loadTodayAppointments...');
        
        const today = new Date().toISOString().split('T')[0];
        const startDate = `${today}T00:00:00`;
        const endDate = `${today}T23:59:59`;
        
        // Query similar ao loadAppointments (sem filtros)
        const { data: allData, error: allError } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .order('data_horario', { ascending: true });
        
        if (allError) {
            console.error('❌ Erro ao buscar todos os dados:', allError);
            return;
        }
        
        // Query similar ao loadTodayAppointments (filtrado por hoje)
        const { data: todayData, error: todayError } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (todayError) {
            console.error('❌ Erro ao buscar dados de hoje:', todayError);
            return;
        }
        
        console.log('📊 Todos os dados (loadAppointments style):', allData);
        console.log('🏠 Dados de hoje (loadTodayAppointments style):', todayData);
        
        // Verificar se há dados de hoje nos dados gerais
        const todayFromAll = allData.filter(apt => {
            const aptDate = new Date(apt.data_horario).toISOString().split('T')[0];
            return aptDate === today;
        });
        
        console.log('🔍 Dados de hoje extraídos dos dados gerais:', todayFromAll);
        
        // Comparar campos específicos
        if (todayData && todayData.length > 0) {
            console.log('🔍 Primeiro item de hoje - campos importantes:');
            console.log('- cliente_nome:', todayData[0].cliente_nome);
            console.log('- cliente_telefone:', todayData[0].cliente_telefone);
            console.log('- servico_nome:', todayData[0].servico_nome);
        }
        
        if (todayFromAll && todayFromAll.length > 0) {
            console.log('🔍 Primeiro item de hoje (dos dados gerais) - campos importantes:');
            console.log('- cliente_nome:', todayFromAll[0].cliente_nome);
            console.log('- cliente_telefone:', todayFromAll[0].cliente_telefone);
            console.log('- servico_nome:', todayFromAll[0].servico_nome);
        }
        
    } catch (error) {
        console.error('❌ Erro na comparação:', error);
    }
}

// Função para testar queries diretas nas tabelas (sem view)
async function testDirectQueries() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🔍 Testando queries diretas nas tabelas...');
        
        const today = new Date().toISOString().split('T')[0];
        const startDate = `${today}T00:00:00`;
        const endDate = `${today}T23:59:59`;
        
        // Query direta com JOINs manuais
        const { data: directData, error: directError } = await supabaseClient
            .from('agendamentos')
            .select(`
                id,
                data_horario,
                horario_inicio,
                horario_fim,
                status,
                preco_cobrado,
                observacoes,
                clientes!inner(nome, telefone),
                servicos!inner(nome, duracao_minutos)
            `)
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (directError) {
            console.error('❌ Erro na query direta:', directError);
            return;
        }
        
        console.log('🎯 Dados da query direta:', directData);
        
        // Mapear dados para formato compatível
        const mappedData = directData.map(apt => ({
            id: apt.id,
            data_horario: apt.data_horario,
            horario_inicio: apt.horario_inicio,
            horario_fim: apt.horario_fim,
            status: apt.status,
            preco_cobrado: apt.preco_cobrado,
            observacoes: apt.observacoes,
            cliente_nome: apt.clientes.nome,
            cliente_telefone: apt.clientes.telefone,
            servico_nome: apt.servicos.nome,
            duracao_minutos: apt.servicos.duracao_minutos,
            valor_pago: 0, // Simplificado para teste
            valor_pendente: apt.preco_cobrado,
            status_pagamento: 'pendente'
        }));
        
        console.log('🎯 Dados mapeados da query direta:', mappedData);
        
        // Comparar com a view
        const { data: viewData, error: viewError } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (viewError) {
            console.error('❌ Erro na view:', viewError);
        } else {
            console.log('📊 Dados da view para comparação:', viewData);
        }
        
    } catch (error) {
        console.error('❌ Erro no teste de queries diretas:', error);
    }
}

// Versão alternativa do loadAppointments usando query direta
async function loadAppointmentsDirect() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - usando dados de exemplo');
        renderAppointmentsTable(getExampleAppointments());
        return;
    }
    
    try {
        showLoading();
        console.log('🔄 Carregando agendamentos com query direta...');
        
        // Query direta com JOINs
        const { data: appointments, error } = await supabaseClient
            .from('agendamentos')
            .select(`
                id,
                data_horario,
                horario_inicio,
                horario_fim,
                status,
                preco_cobrado,
                observacoes,
                cliente_id,
                servico_id,
                clientes!inner(nome, telefone),
                servicos!inner(nome, duracao_minutos, preco)
            `)
            .order('data_horario', { ascending: true });
        
        if (error) {
            console.error('❌ Erro ao carregar agendamentos:', error);
            throw error;
        }
        
        console.log('📊 Dados brutos da query direta:', appointments);
        
        // Buscar pagamentos separadamente para evitar problemas de GROUP BY
        const appointmentIds = appointments.map(apt => apt.id);
        let paymentsData = [];
        
        if (appointmentIds.length > 0) {
            const { data: payments, error: paymentsError } = await supabaseClient
                .from('pagamentos')
                .select('agendamento_id, valor_pago')
                .in('agendamento_id', appointmentIds);
            
            if (!paymentsError) {
                paymentsData = payments || [];
            }
        }
        
        // Mapear dados para formato compatível
        const mappedAppointments = appointments.map(apt => {
            const totalPaid = paymentsData
                .filter(p => p.agendamento_id === apt.id)
                .reduce((sum, p) => sum + parseFloat(p.valor_pago || 0), 0);
            
            const valorPendente = Math.max(0, parseFloat(apt.preco_cobrado || 0) - totalPaid);
            
            return {
                id: apt.id,
                data_horario: apt.data_horario,
                horario_inicio: apt.horario_inicio,
                horario_fim: apt.horario_fim,
                status: apt.status,
                preco_cobrado: apt.preco_cobrado,
                observacoes: apt.observacoes,
                cliente_id: apt.cliente_id,
                servico_id: apt.servico_id,
                cliente_nome: apt.clientes?.nome || 'Cliente não encontrado',
                cliente_telefone: apt.clientes?.telefone || '',
                servico_nome: apt.servicos?.nome || 'Serviço não encontrado',
                duracao_minutos: apt.servicos?.duracao_minutos || 0,
                valor_pago: totalPaid,
                valor_pendente: valorPendente,
                status_pagamento: valorPendente > 0 ? 'pendente' : 'pago'
            };
        });
        
        console.log('🎯 Dados mapeados:', mappedAppointments);
        renderAppointmentsTable(mappedAppointments);
        
    } catch (error) {
        console.error('❌ Erro ao carregar agendamentos:', error);
        showNotification('Erro ao carregar agendamentos: ' + error.message, 'error');
        renderAppointmentsTable(getExampleAppointments());
    } finally {
        hideLoading();
    }
}

// Versão alternativa do loadTodayAppointments usando query direta
async function loadTodayAppointmentsDirect() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - usando dados de exemplo');
        renderTodaySchedule(getExampleTodayAppointments());
        return;
    }
    
    try {
        console.log('🔄 Carregando agendamentos de hoje com query direta...');
        
        const today = new Date().toISOString().split('T')[0];
        const startDate = `${today}T00:00:00`;
        const endDate = `${today}T23:59:59`;
        
        // Query direta com JOINs
        const { data: appointments, error } = await supabaseClient
            .from('agendamentos')
            .select(`
                id,
                data_horario,
                horario_inicio,
                horario_fim,
                status,
                preco_cobrado,
                observacoes,
                cliente_id,
                servico_id,
                clientes!inner(nome, telefone),
                servicos!inner(nome, duracao_minutos, preco)
            `)
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (error) {
            console.error('❌ Erro ao carregar agendamentos de hoje:', error);
            throw error;
        }
        
        console.log('📊 Dados brutos de hoje (query direta):', appointments);
        
        // Buscar pagamentos separadamente
        const appointmentIds = appointments.map(apt => apt.id);
        let paymentsData = [];
        
        if (appointmentIds.length > 0) {
            const { data: payments, error: paymentsError } = await supabaseClient
                .from('pagamentos')
                .select('agendamento_id, valor_pago')
                .in('agendamento_id', appointmentIds);
            
            if (!paymentsError) {
                paymentsData = payments || [];
            }
        }
        
        // Mapear dados para formato compatível
        const mappedAppointments = appointments.map(apt => {
            const totalPaid = paymentsData
                .filter(p => p.agendamento_id === apt.id)
                .reduce((sum, p) => sum + parseFloat(p.valor_pago || 0), 0);
            
            const valorPendente = Math.max(0, parseFloat(apt.preco_cobrado || 0) - totalPaid);
            
            return {
                id: apt.id,
                data_horario: apt.data_horario,
                horario_inicio: apt.horario_inicio,
                horario_fim: apt.horario_fim,
                status: apt.status,
                preco_cobrado: apt.preco_cobrado,
                observacoes: apt.observacoes,
                cliente_id: apt.cliente_id,
                servico_id: apt.servico_id,
                cliente_nome: apt.clientes?.nome || 'Cliente não encontrado',
                cliente_telefone: apt.clientes?.telefone || '',
                servico_nome: apt.servicos?.nome || 'Serviço não encontrado',
                duracao_minutos: apt.servicos?.duracao_minutos || 0,
                valor_pago: totalPaid,
                valor_pendente: valorPendente,
                status_pagamento: valorPendente > 0 ? 'pendente' : 'pago'
            };
        });
        
        console.log('🎯 Dados de hoje mapeados:', mappedAppointments);
        renderTodaySchedule(mappedAppointments);
        
    } catch (error) {
        console.error('❌ Erro ao carregar agendamentos de hoje:', error);
        showNotification('Erro ao carregar agendamentos de hoje: ' + error.message, 'error');
        renderTodaySchedule(getExampleTodayAppointments());
    }
}

// Função para testar e comparar as duas abordagens
async function testBothApproaches() {
    console.log('🔬 === TESTE COMPARATIVO: VIEW vs QUERY DIRETA ===');
    
    console.log('\n1️⃣ Testando com VIEW (método atual):');
    await compareAppointmentData();
    
    console.log('\n2️⃣ Testando com QUERY DIRETA:');
    await testDirectQueries();
    
    console.log('\n3️⃣ Carregando dados com QUERY DIRETA:');
    console.log('📊 Carregando todos os agendamentos...');
    await loadAppointmentsDirect();
    
    console.log('🏠 Carregando agendamentos de hoje...');
    await loadTodayAppointmentsDirect();
    
    console.log('\n✅ Teste completo! Verifique os logs acima para comparar os resultados.');
}

// Função para alternar para o modo de query direta permanentemente
function switchToDirectMode() {
    console.log('🔄 Alternando para modo de query direta...');
    
    // Substituir as funções originais pelas versões diretas
    window.loadAppointments = loadAppointmentsDirect;
    window.loadTodayAppointments = loadTodayAppointmentsDirect;
    
    console.log('✅ Modo alterado! As próximas chamadas usarão queries diretas.');
    console.log('💡 Para testar, navegue entre as abas ou recarregue os dados.');
}

// Função para voltar ao modo original (view)
function switchToViewMode() {
    console.log('🔄 Voltando para modo de view...');
    
    // Recarregar a página para restaurar as funções originais
    location.reload();
}

// Função para normalizar telefone - remove todos os caracteres não numéricos
function normalizePhone(phone) {
    if (!phone) return '';
    
    // Remove todos os caracteres não numéricos
    let normalized = phone.replace(/\D/g, '');
    
    // Debug removido para performance
    
    // Se tem 13 dígitos e começa com 55, remove o código do país
    if (normalized.length === 13 && normalized.startsWith('55')) {
        normalized = normalized.substring(2);
    }
    
    // Se tem 12 dígitos e começa com 55, remove o código do país
    if (normalized.length === 12 && normalized.startsWith('55')) {
        normalized = normalized.substring(2);
    }
    
    // Se tem 11 dígitos, está no formato correto (DDD + 9 + número)
    if (normalized.length === 11) {
        return normalized;
    }
    
    // Se tem 10 dígitos, adiciona o 9 após o DDD
    if (normalized.length === 10) {
        const ddd = normalized.substring(0, 2);
        const numero = normalized.substring(2);
        normalized = ddd + '9' + numero;
    }
    
    // Se tem 9 dígitos, adiciona DDD padrão (31 - Belo Horizonte)
    if (normalized.length === 9) {
        normalized = '31' + normalized;
    }
    
    // Se tem 8 dígitos, adiciona DDD e o 9
    if (normalized.length === 8) {
        normalized = '319' + normalized;
    }
    
    // Debug removido para performance
    return normalized;
}

// Função para formatar telefone para exibição (DDD) 9XXXX-XXXX
function formatPhoneDisplay(phone) {
    const normalized = normalizePhone(phone);
    
    if (normalized.length === 11) {
        const ddd = normalized.substring(0, 2);
        const firstPart = normalized.substring(2, 7);
        const secondPart = normalized.substring(7);
        return `(${ddd}) ${firstPart}-${secondPart}`;
    }
    
    return phone; // Retorna original se não conseguir formatar
}

// Função para comparar telefones (verifica se são o mesmo número)
function phonesMatch(phone1, phone2) {
    const normalized1 = normalizePhone(phone1);
    const normalized2 = normalizePhone(phone2);
    return normalized1 === normalized2;
}

// Função utilitária para formatar horário sem segundos
function formatTimeHHMM(timeString) {
    if (!timeString) return '';
    
    // Se já está no formato HH:MM, retorna como está
    if (timeString.match(/^\d{1,2}:\d{2}$/)) {
        return timeString;
    }
    
    // Se tem segundos (HH:MM:SS), remove os segundos
    if (timeString.includes(':') && timeString.split(':').length === 3) {
        return timeString.substring(0, 5);
    }
    
    // Se é um objeto Date ou timestamp, converte para HH:MM
    try {
        const date = new Date(timeString);
        if (!isNaN(date.getTime())) {
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
        }
    } catch (e) {
        console.warn('Erro ao formatar horário:', timeString, e);
    }
    
    return timeString;
}

// Função para obter horário formatado de um agendamento
function getFormattedTime(appointment) {
    if (appointment.horario_inicio) {
        return formatTimeHHMM(appointment.horario_inicio);
    }
    
    if (appointment.data_horario) {
        const appointmentDate = new Date(appointment.data_horario);
        const hours = appointmentDate.getHours().toString().padStart(2, '0');
        const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
    
    return '';
}

// Função para calcular todos os slots de 30 minutos ocupados durante um período
function getOccupiedTimeSlots(startTime, endTime) {
    const slots = [];
    
    if (!startTime) {
        return slots;
    }
    
    // Se não tem horário de fim, assumir 30 minutos
    if (!endTime) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const startDate = new Date();
        startDate.setHours(hours, minutes, 0, 0);
        const endDate = new Date(startDate.getTime() + 30 * 60000); // +30 minutos
        endTime = `${endDate.getHours().toString().padStart(2, '0')}:${endDate.getMinutes().toString().padStart(2, '0')}`;
    }
    
    // Converter horários para minutos para facilitar o cálculo
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHours * 60 + startMinutes;
    const endTotalMinutes = endHours * 60 + endMinutes;
    
    // Gerar todos os slots de 30 minutos no período
    for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const timeSlot = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        slots.push(timeSlot);
    }
    
    return slots;
}

// Credenciais de login
const VALID_CREDENTIALS = {
    username: 'jaonegro',
    password: 'crioulo'
};

// Elementos DOM
const loginScreen = document.getElementById('loginScreen');
const dashboard = document.getElementById('dashboard');
const loginForm = document.getElementById('loginForm');
const errorMessage = document.getElementById('loginError');
const userNameSpan = document.getElementById('userName');

// Inicialização
document.addEventListener('DOMContentLoaded', function() {
    initializeApp();
    setupEventListeners();
    loadAllClients();
    setupAllClientAutocomplete();
    
    // Definir data de hoje por padrão
    const today = new Date().toISOString().split('T')[0];
    const scheduleDateInput = document.getElementById('scheduleDate');
    if (scheduleDateInput) {
        scheduleDateInput.value = today;
    }
    
    const currentDateInput = document.getElementById('currentDate');
    if (currentDateInput) {
        currentDateInput.value = today;
    }
    
    // Configurar filtros de turno após um pequeno delay
    setTimeout(() => {
        setupScheduleFilters();
    }, 500);
});

function initializeApp() {
    // Verificar se já está logado
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
        currentUser = JSON.parse(savedUser);
        showDashboard();
        
        // Definir datas padrão
        setDefaultDates();
        
        loadDashboardData();
        
        // Inicializar sistema de verificação automática de agendamentos
        if (isSupabaseConfigured) {
            initializeAppointmentStatusChecker();
        }
    } else {
        showLogin();
    }
}

function setDefaultDates() {
    const today = new Date().toISOString().split('T')[0];
    
    // Definir data atual para overview
    const currentDateInput = document.getElementById('currentDate');
    if (currentDateInput && !currentDateInput.value) {
        currentDateInput.value = today;
    }
    
    // Definir data atual para agenda
    const scheduleDateInput = document.getElementById('scheduleDate');
    if (scheduleDateInput && !scheduleDateInput.value) {
        scheduleDateInput.value = today;
    }
    
    console.log('Datas padrão definidas:', today);
}

function setupEventListeners() {
    // Login form
    loginForm.addEventListener('submit', handleLogin);
    
    // Logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navegação
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });
    
    // Botões de ação
    document.getElementById('currentDate').addEventListener('change', loadOverviewData);
    document.getElementById('todayBtn').addEventListener('click', () => setDateToToday('currentDate'));
    document.getElementById('scheduleTodayBtn').addEventListener('click', () => setDateToToday('scheduleDate'));
    document.getElementById('tomorrowBtn').addEventListener('click', () => setDateToTomorrow('scheduleDate'));
    document.getElementById('refreshAppointments').addEventListener('click', () => loadAppointments());
    
    // Modal
    document.querySelector('.close').addEventListener('click', closeModal);
    document.querySelector('.btn-cancel').addEventListener('click', closeModal);
    // Remover listener genérico que conflita com o modal de adicionar

    // Listener dedicado ao formulário de adicionar (evita conflito)
    const addForm = document.getElementById('addForm');
    if (addForm) {
        addForm.addEventListener('submit', (e) => {
            // Impedir múltiplos envios
            if (addForm.dataset.submitting === 'true') {
                e.preventDefault();
                return;
            }
            addForm.dataset.submitting = 'true';
            addNewAppointment(e).finally(() => {
                delete addForm.dataset.submitting;
            });
        });
    }
    
    // Filtros
    document.getElementById('dateFilter').addEventListener('change', loadAppointments);
    document.getElementById('statusFilter').addEventListener('change', loadAppointments);
    document.getElementById('clientSearch').addEventListener('input', filterClients);
    document.getElementById('scheduleDate').addEventListener('change', loadScheduleGrid);
    document.getElementById('reportStartDate').addEventListener('change', updateReportData);
    document.getElementById('reportEndDate').addEventListener('change', updateReportData);
}

// Autenticação
async function handleLogin(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    if (username === VALID_CREDENTIALS.username && password === VALID_CREDENTIALS.password) {
        currentUser = { username: 'Jão', role: 'barbeiro' };
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        showDashboard();
        await loadDashboardData();
    } else {
        showError('Usuário ou senha incorretos!');
    }
}

function handleLogout() {
    currentUser = null;
    localStorage.removeItem('currentUser');
    showLogin();
}

function showLogin() {
    loginScreen.style.display = 'flex';
    dashboard.style.display = 'none';
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    hideError();
}

function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display = 'grid';
    userNameSpan.textContent = currentUser.username;
    showSection('overview');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

// Navegação
function handleNavigation(e) {
    e.preventDefault();
    const sectionId = e.currentTarget.getAttribute('data-section');
    showSection(sectionId);
}

function showSection(sectionId) {
    // Atualizar navegação ativa
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
    
    // Mostrar seção
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    currentSection = sectionId;
    
    // Carregar dados específicos da seção
    switch(sectionId) {
        case 'overview':
            loadOverviewData();
            break;
        case 'appointments':
            loadAppointments();
            break;
        case 'schedule':
            loadScheduleGrid();
            break;
        case 'clients':
            loadClients();
            setupClientSearch();
            break;
        case 'reports':
            // Carregar relatórios automaticamente
            setTimeout(() => loadReports(), 100);
            break;
        case 'unpaid':
            loadUnpaidClients();
            break;
    }
}

// Carregamento de dados
async function loadDashboardData() {
    showLoading();
    try {
        // Carregar serviços primeiro
        await loadServices();
        
        // Carregar dados sequencialmente para garantir que appointments seja carregado primeiro
        await loadAppointments();
        
        // Aguardar um pouco para garantir que appointments foi populado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await loadTodayAppointments();
        await loadOverviewData();
        
        // Carregar grade de horários se estivermos na seção agenda
        if (currentSection === 'schedule') {
            await loadScheduleGrid();
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showError('Erro ao carregar dados do dashboard');
    } finally {
        hideLoading();
    }
}

async function loadAppointments() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar agendamentos');
        showError('Erro: Supabase não configurado. Configure o arquivo config.js');
        return;
    }
    
    try {
        const dateFilter = document.getElementById('dateFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        
        // Usar a view que já faz os JOINs
        let query = supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .order('data_horario', { ascending: true });
        
        if (dateFilter) {
            // Filtrar por data usando a coluna data_horario
            const startDate = `${dateFilter}T00:00:00`;
            const endDate = `${dateFilter}T23:59:59`;
            query = query.gte('data_horario', startDate).lte('data_horario', endDate);
        }
        
        if (statusFilter && statusFilter !== 'todos') {
            query = query.eq('status', statusFilter);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        console.log('📊 Dados brutos da view vw_agendamentos_completos:', data);
        
        // Mapear dados da view para formato compatível
        appointments = (data || []).map(apt => {
            console.log('🔍 Processando agendamento da view:', apt);
            console.log('🔍 Campos disponíveis:', Object.keys(apt));
            
            const mapped = {
                id: apt.id,
                data_horario: apt.data_horario,
                horario_inicio: apt.horario_inicio,
                horario_fim: apt.horario_fim,
                status: apt.status,
                preco_cobrado: parseFloat(apt.preco_cobrado) || 0,
                observacoes: apt.observacoes,
                cliente_nome: (apt.cliente_nome && String(apt.cliente_nome).trim() && !['undefined','null'].includes(String(apt.cliente_nome).trim().toLowerCase())) ? apt.cliente_nome : 'Cliente não identificado',
                telefone: (apt.cliente_telefone && String(apt.cliente_telefone).trim() && !['undefined','null'].includes(String(apt.cliente_telefone).trim().toLowerCase())) ? apt.cliente_telefone : '',
                servico: apt.servico_nome, 
                duracao_minutos: apt.duracao_minutos,
                valor_pago: apt.valor_pago || 0,
                valor_pendente: apt.valor_pendente || 0,
                pagamento: apt.status_pagamento,
                forma_pagamento: apt.status_pagamento === 'pago' ? 'pago' : 'pendente'
            };
            
            console.log('✅ Agendamento mapeado:', mapped);
            console.log('✅ Cliente nome final:', mapped.cliente_nome);
            console.log('✅ Serviço final:', mapped.servico);
            return mapped;
        });
        
        renderAppointmentsTable();
        
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        showError('Erro ao carregar agendamentos');
    }
}



async function loadTodayAppointments() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar agendamentos de hoje');
        return;
    }
    
    try {
        const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
        const startDate = `${selectedDate}T00:00:00`;
        const endDate = `${selectedDate}T23:59:59`;
        
        console.log('🏠 loadTodayAppointments - Data selecionada:', selectedDate);
        console.log('🏠 loadTodayAppointments - Período:', startDate, 'até', endDate);
        
        const { data, error } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (error) throw error;
        
        console.log('🏠 loadTodayAppointments - Dados brutos da view:', data);
        
        // Mapear dados da view para formato compatível
        todayAppointments = (data || []).map((apt, index) => {
            console.log(`🏠 loadTodayAppointments - Processando item ${index + 1}:`, apt);
            console.log(`🏠 loadTodayAppointments - Campos disponíveis:`, Object.keys(apt));
            
            const mapped = {
                id: apt.id,
                data_horario: apt.data_horario,
                horario_inicio: apt.horario_inicio,
                horario_fim: apt.horario_fim,
                status: apt.status,
                preco_cobrado: parseFloat(apt.preco_cobrado) || 0,
                observacoes: apt.observacoes,
                cliente_nome: (apt.cliente_nome && String(apt.cliente_nome).trim() && !['undefined','null'].includes(String(apt.cliente_nome).trim().toLowerCase())) ? apt.cliente_nome : 'Cliente não identificado',
                telefone: (apt.cliente_telefone && String(apt.cliente_telefone).trim() && !['undefined','null'].includes(String(apt.cliente_telefone).trim().toLowerCase())) ? apt.cliente_telefone : '',
                servico: apt.servico_nome, 
                duracao_minutos: apt.duracao_minutos,
                valor_pago: apt.valor_pago || 0,
                valor_pendente: apt.valor_pendente || 0,
                pagamento: apt.status_pagamento,
                forma_pagamento: apt.status_pagamento === 'pago' ? 'pago' : 'pendente'
            };
            
            console.log(`🏠 loadTodayAppointments - Item mapeado ${index + 1}:`, mapped);
            console.log(`🏠 loadTodayAppointments - Cliente: "${mapped.cliente_nome}", Serviço: "${mapped.servico}"`);
            return mapped;
        });
        
        console.log('🏠 loadTodayAppointments - Array final todayAppointments:', todayAppointments);
        renderTodaySchedule();
        
    } catch (error) {
        console.error('Erro ao carregar agendamentos de hoje:', error);
    }
}

async function loadOverviewData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar dados de overview');
        return;
    }
    
    try {
        // Usar a data selecionada ou hoje como padrão
        const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        
        console.log('Data selecionada para overview:', selectedDate);
        
        // Agendamentos da data selecionada
        const { data: selectedDateData } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', `${selectedDate}T00:00:00`)
            .lte('data_horario', `${selectedDate}T23:59:59`);
        
        // Agendamentos do mês
        const { data: monthData } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', `${startOfMonth}T00:00:00`);
        
        // Clientes únicos do mês
        const uniqueClients = new Set(monthData?.map(item => item.cliente_nome) || []);
        
        // Receita do mês (baseada nos preços dos agendamentos concluídos)
        const monthlyRevenue = monthData?.filter(apt => apt.status === 'concluido')
            .reduce((total, apt) => total + (parseFloat(apt.preco_cobrado) || 0), 0) || 0;
        
        // Próximo cliente da data selecionada
        const nextAppointment = selectedDateData?.find(apt => {
            const now = new Date();
            const aptTime = new Date(apt.data_horario);
            return aptTime > now && (apt.status === 'agendado' || apt.status === 'confirmado');
        });
        const nextClient = nextAppointment ? nextAppointment.cliente_nome : 'Nenhum';
        
        // Receita da data selecionada
        const selectedDateRevenue = selectedDateData?.filter(apt => apt.status === 'concluido')
            .reduce((total, apt) => total + (parseFloat(apt.preco_cobrado) || 0), 0) || 0;
        
        // Taxa de ocupação (estimativa)
        const totalSlots = 20; // 10 horas * 2 slots por hora
        const occupiedSlots = selectedDateData?.length || 0;
        const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);
        
        // Atualizar elementos de estatísticas
        document.getElementById('todayAppointments').textContent = selectedDateData?.length || 0;
        document.getElementById('nextClient').textContent = nextClient;
        document.getElementById('todayRevenue').textContent = `R$ ${selectedDateRevenue.toFixed(2)}`;
        document.getElementById('occupancyRate').textContent = `${occupancyRate}%`;
        
        // Atualizar agendamentos de hoje se a data selecionada for hoje
        const today = new Date().toISOString().split('T')[0];
        if (selectedDate === today) {
            todayAppointments = selectedDateData || [];
            renderTodaySchedule();
        }
        
    } catch (error) {
        console.error('Erro ao carregar dados de overview:', error);
    }
}



async function loadScheduleGrid() {
    const selectedDate = document.getElementById('scheduleDate')?.value || new Date().toISOString().split('T')[0];
    
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar grade de horários');
        return;
    }
    
    try {
        const startDate = `${selectedDate}T00:00:00`;
        const endDate = `${selectedDate}T23:59:59`;
        
        const { data, error } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .gte('data_horario', startDate)
            .lte('data_horario', endDate);
        
        if (error) throw error;
        
        renderScheduleGrid(data || [], selectedDate);
        
    } catch (error) {
        console.error('Erro ao carregar grade de horários:', error);
        showNotification('Erro ao carregar horários', 'error');
    }
}

async function loadReports() {
    // Carregando relatórios...
    
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar relatórios');
        return;
    }
    
    try {
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        let query = supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .order('data_horario', { ascending: false });
        
        if (startDate) {
            query = query.gte('data_horario', `${startDate}T00:00:00`);
        }
        
        if (endDate) {
            query = query.lte('data_horario', `${endDate}T23:59:59`);
        }
        
        // Se não há filtros, limitar aos últimos 30 dias
        if (!startDate && !endDate) {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            query = query.gte('data_horario', thirtyDaysAgo.toISOString());
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        // Dados carregados com sucesso
        renderReports(data || []);
        
    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
        showNotification('Erro ao carregar relatórios: ' + error.message, 'error');
    }
}

// Renderização
function renderAppointmentsTable() {
    const tbody = document.getElementById('appointmentsTableBody');
    if (!tbody) {
        console.error('Elemento appointmentsTableBody não encontrado');
        return;
    }
    
    // Renderizando tabela de agendamentos
    tbody.innerHTML = '';
    
    if (appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: rgba(255,255,255,0.5);">Nenhum agendamento encontrado</td></tr>';
        return;
    }
    
    appointments.forEach(appointment => {
        console.log('🎨 Renderizando agendamento na tabela:', appointment);
        
        // Garantir que todos os valores necessários existam (evitar string "undefined"/"null")
        const rawNome = appointment?.cliente_nome ?? appointment?.nome_cliente ?? appointment?.nome ?? '';
        const clienteNome = (typeof rawNome === 'string' && rawNome.trim() && !['undefined','null'].includes(rawNome.trim().toLowerCase())) ? rawNome : 'Cliente não identificado';
        
        const rawTelefone = appointment?.telefone ?? appointment?.cliente_telefone ?? '';
        const telefone = (typeof rawTelefone === 'string' && rawTelefone.trim() && !['undefined','null'].includes(rawTelefone.trim().toLowerCase())) ? formatPhoneDisplay(rawTelefone) : 'Telefone não informado';
        
        const rawServico = appointment?.servico ?? appointment?.nome_servico ?? appointment?.servico_nome ?? '';
        const servicoNome = (typeof rawServico === 'string' && rawServico.trim() && !['undefined','null'].includes(rawServico.trim().toLowerCase())) ? rawServico : 'Serviço';
        const status = appointment.status || 'agendado';
        const appointmentId = appointment.id || appointment.agendamento_id || 0;
        const precoCobrando = parseFloat(appointment.preco_cobrado ?? appointment.preco ?? 0) || 0;
        
        const row = document.createElement('tr');
        const appointmentDate = new Date(appointment.data_horario);
        const dateStr = appointmentDate.toLocaleDateString('pt-BR');
        
        // Formatar horário com início e fim
        let timeStr = getFormattedTime(appointment);
        if (appointment.horario_fim) {
            const endTime = formatTimeHHMM(appointment.horario_fim);
            timeStr += ` - ${endTime}`;
        }
        
        // Se timeStr estiver vazio, usar um valor padrão
        if (!timeStr) {
            timeStr = '00:00';
        }
        
        console.log('📋 Dados para renderização:', {
            clienteNome,
            telefone,
            servicoNome,
            status,
            appointmentId,
            precoCobrando
        });
        
        row.innerHTML = `
            <td>${clienteNome}</td>
            <td>${telefone}</td>
            <td>${servicoNome}</td>
            <td>${dateStr}</td>
            <td>${timeStr}</td>
            <td>R$ ${precoCobrando.toFixed(2)}</td>
            <td><span class="status-badge status-${status}">${status}</span></td>
            <td>
                <button class="action-btn btn-edit" onclick="editAppointment(${appointmentId})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn btn-delete" onclick="deleteAppointment(${appointmentId})">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

function renderTodaySchedule() {
    const container = document.getElementById('todayScheduleList');
    if (!container) {
        console.error('Container todayScheduleList não encontrado');
        return;
    }
    
    console.log('🏠 renderTodaySchedule - Iniciando renderização da visão geral');
    console.log('🏠 todayAppointments array:', todayAppointments);
    
    // Renderizando agendamentos de hoje
    container.innerHTML = '';
    
    if (todayAppointments.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Nenhum agendamento para hoje</p>';
        console.log('🏠 Nenhum agendamento para hoje');
        return;
    }

    // Ordenar agendamentos por horário
    const sortedAppointments = [...todayAppointments].sort((a, b) => {
        const timeA = getFormattedTime(a);
        const timeB = getFormattedTime(b);
        return timeA.localeCompare(timeB);
    });

    console.log('🏠 Agendamentos ordenados:', sortedAppointments);

    // Renderizar cada agendamento
    let htmlContent = '';
    sortedAppointments.forEach((appointment, index) => {
        console.log(`🏠 Processando agendamento ${index + 1}:`, appointment);
        
        // Garantir que todos os valores necessários existam (evitar string "undefined"/"null")
        const rawNome = appointment?.cliente_nome ?? appointment?.nome_cliente ?? appointment?.nome ?? '';
        const clienteNome = (typeof rawNome === 'string' && rawNome.trim() && !['undefined','null'].includes(rawNome.trim().toLowerCase())) ? rawNome : 'Cliente não identificado';
        const rawServico = appointment?.servico ?? appointment?.nome_servico ?? appointment?.servico_nome ?? '';
        const servicoNome = (typeof rawServico === 'string' && rawServico.trim() && !['undefined','null'].includes(rawServico.trim().toLowerCase())) ? rawServico : 'Serviço';
        const rawTelefone = appointment?.telefone ?? appointment?.cliente_telefone ?? '';
        const telefone = (typeof rawTelefone === 'string' && rawTelefone.trim() && !['undefined','null'].includes(rawTelefone.trim().toLowerCase())) ? formatPhoneDisplay(rawTelefone) : '';
        const status = appointment.status || 'agendado';
        const appointmentId = appointment.id || appointment.agendamento_id || 0;
        
        console.log(`🏠 Valores mapeados:`, {
            clienteNome,
            servicoNome,
            telefone,
            status,
            appointmentId
        });
        
        const appointmentDate = new Date(appointment.data_horario);
        
        // Formatar horário com início e fim
        let timeStr = getFormattedTime(appointment);
        if (appointment.horario_fim) {
            const endTime = formatTimeHHMM(appointment.horario_fim);
            timeStr += ` - ${endTime}`;
        }
        
        // Se timeStr estiver vazio, usar um valor padrão
        if (!timeStr) {
            timeStr = '00:00';
        }
        
        console.log(`🏠 Valores finais - Cliente: "${clienteNome}", Serviço: "${servicoNome}", Horário: "${timeStr}"`);
        
        htmlContent += `
            <div class="schedule-item" data-period="${getTimePeriod(appointment)}">
                <div class="schedule-item-info">
                    <div class="schedule-time">${timeStr}</div>
                    <div class="schedule-client">${clienteNome}</div>
                    <div class="schedule-service">${servicoNome}</div>
                </div>
                <div class="schedule-actions">
                    <span class="status-badge status-${status}">${status}</span>
                    <button class="action-btn btn-edit" onclick="window.editAppointment(${appointmentId})" title="Editar" data-id="${appointmentId}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="window.deleteAppointment(${appointmentId})" title="Excluir" data-id="${appointmentId}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
    console.log('🏠 HTML final gerado:', htmlContent);
    container.innerHTML = htmlContent;
    
    // Adicionar event listeners programaticamente como backup
    setTimeout(() => {
        setupScheduleFilters();
        setupTodayScheduleEventListeners();
    }, 100);
}

// Função para configurar event listeners dos botões na visão geral
function setupTodayScheduleEventListeners() {
    const editButtons = document.querySelectorAll('#todayScheduleList .btn-edit');
    const deleteButtons = document.querySelectorAll('#todayScheduleList .btn-delete');
    
    // Configurando event listeners
    
    editButtons.forEach(button => {
        const appointmentId = button.getAttribute('data-id');
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Botão editar clicado
            editAppointment(appointmentId);
        });
    });
    
    deleteButtons.forEach(button => {
        const appointmentId = button.getAttribute('data-id');
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Botão deletar clicado
            deleteAppointment(appointmentId);
        });
    });
}

function getTimePeriod(appointment) {
    const timeStr = getFormattedTime(appointment);
    const hour = parseInt(timeStr.split(':')[0]);
    
    if (hour >= 6 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 18) return 'afternoon';
    return 'evening';
}

function setupScheduleFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    // Configurando filtros de turno
    
    if (filterButtons.length === 0) {
        console.warn('Nenhum botão de filtro encontrado');
        return;
    }
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            // Filtro aplicado
            
            // Remover classe active de todos os botões
            filterButtons.forEach(btn => btn.classList.remove('active'));
            // Adicionar classe active ao botão clicado
            this.classList.add('active');
            
            const period = this.getAttribute('data-period');
            filterScheduleByPeriod(period);
        });
    });
}

function filterScheduleByPeriod(period) {
    const scheduleItems = document.querySelectorAll('.schedule-item');
    
    scheduleItems.forEach(item => {
        if (period === 'all' || item.getAttribute('data-period') === period) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function renderScheduleGrid(appointments, selectedDate) {
    const container = document.querySelector('.schedule-container');
    if (!container) return;

    // Verificar dia da semana
    const dateObj = new Date(selectedDate + 'T00:00:00');
    const dayOfWeek = dateObj.getDay(); // 0 = Domingo, 1 = Segunda, etc.
    
    // Configuração dos horários de funcionamento baseado no dia
    let workingHours = { morning: [], afternoon: [] };
    let isClosed = false;
    
    if (dayOfWeek === 0 || dayOfWeek === 1) { // Domingo ou Segunda
        isClosed = true;
    } else if (dayOfWeek >= 2 && dayOfWeek <= 4) { // Terça a Quinta: 9h às 19h
        workingHours = {
            morning: ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30'],
            afternoon: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']
        };
    } else if (dayOfWeek === 5) { // Sexta: 8h às 19h
        workingHours = {
            morning: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'],
            afternoon: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00', '18:30', '19:00']
        };
    } else if (dayOfWeek === 6) { // Sábado: 8h às 17h
        workingHours = {
            morning: ['08:00', '08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'],
            afternoon: ['13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00']
        };
    }

    // Criar mapa de agendamentos por horário - apenas para a data selecionada
    const appointmentMap = {};
    
    // Filtrar agendamentos para a data selecionada
    const dayAppointments = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.data_horario);
        const selectedDateObj = new Date(selectedDate + 'T00:00:00');
        
        const aptDateStr = appointmentDate.toISOString().split('T')[0];
        const selectedDateStr = selectedDate;
        

        
        // Comparar apenas a data (ano, mês, dia)
        return aptDateStr === selectedDateStr;
    });
    
    dayAppointments.forEach(appointment => {
        // Extrair horário de início do agendamento
        let startTime, endTime;
        
        if (appointment.horario_inicio) {
            startTime = formatTimeHHMM(appointment.horario_inicio);
            endTime = appointment.horario_fim ? formatTimeHHMM(appointment.horario_fim) : null;
        } else if (appointment.data_horario) {
            // Extrair horário da data_horario
            const appointmentDate = new Date(appointment.data_horario);
            const hours = appointmentDate.getHours().toString().padStart(2, '0');
            const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
            startTime = `${hours}:${minutes}`;
            
            // Se não tem horario_fim, calcular baseado na duração padrão (30 min)
            if (!appointment.horario_fim) {
                const endDate = new Date(appointmentDate.getTime() + 30 * 60000); // +30 minutos
                const endHours = endDate.getHours().toString().padStart(2, '0');
                const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
                endTime = `${endHours}:${endMinutes}`;
            } else {
                endTime = formatTimeHHMM(appointment.horario_fim);
            }
        }
        
        if (startTime) {
            // Marcar todos os slots ocupados durante o período do agendamento
            const occupiedSlots = getOccupiedTimeSlots(startTime, endTime);
            
            occupiedSlots.forEach((slot, index) => {
                // Criar uma cópia do agendamento com informações adicionais
                const appointmentWithSlotInfo = {
                    ...appointment,
                    _slotStartTime: startTime,
                    _slotEndTime: endTime,
                    _isMainSlot: index === 0 // Primeiro slot é sempre o principal
                };
                
                appointmentMap[slot] = appointmentWithSlotInfo;
            });
        }
    });

    // Calcular estatísticas baseadas nos agendamentos do dia
    const totalSlots = isClosed ? 0 : (workingHours.morning.length + workingHours.afternoon.length);
    const occupiedSlots = dayAppointments.length;
    const availableSlots = totalSlots - occupiedSlots;
    const occupancyPercentage = totalSlots > 0 ? Math.round((occupiedSlots / totalSlots) * 100) : 0;

    // Formatar data para exibição
    const dayOfWeekName = dateObj.toLocaleDateString('pt-BR', { weekday: 'long' });
    const formattedDate = dateObj.toLocaleDateString('pt-BR');

    // Se estiver fechado, mostrar mensagem
    if (isClosed) {
        container.innerHTML = `
            <div class="schedule-header">
                <div class="selected-date-info">
                    <h4>${formattedDate}</h4>
                    <div class="day-of-week">${dayOfWeekName}</div>
                </div>
            </div>
            <div class="closed-message">
                <div class="closed-icon">🚫</div>
                <h3>Barbearia Fechada</h3>
                <p>Domingo e Segunda-feira não funcionamos</p>
                <div class="working-hours-info">
                    <h4>Horários de Funcionamento:</h4>
                    <ul>
                        <li><strong>Terça a Quinta:</strong> 9h às 19h</li>
                        <li><strong>Sexta:</strong> 8h às 19h</li>
                        <li><strong>Sábado:</strong> 8h às 17h</li>
                        <li><strong>Domingo e Segunda:</strong> FECHADO</li>
                    </ul>
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="schedule-header">
            <div class="selected-date-info">
                <h4>${formattedDate}</h4>
                <div class="day-of-week">${dayOfWeekName}</div>
            </div>
            <div class="schedule-legend">
                <div class="legend-item">
                    <div class="legend-color available"></div>
                    <span>Disponível</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color occupied"></div>
                    <span>Ocupado</span>
                </div>
                <div class="legend-item">
                    <div class="legend-color closed"></div>
                    <span>Fechado</span>
                </div>
            </div>
        </div>

        <div class="time-periods">
            <div class="period-section">
                <h3 class="period-title">🌅 Manhã</h3>
                <div class="time-slots">
                    ${workingHours.morning.map(time => {
                        const appointment = appointmentMap[time];
                        const status = appointment ? 'occupied' : 'available';
                        
                        let timeDisplay = time;
                        let clientDisplay = '';
                        let isMainSlot = false;
                        
                        if (appointment) {
                            // Usar a informação de slot principal/secundário que foi definida no mapeamento
                            isMainSlot = appointment._isMainSlot || false;
                            
                            if (isMainSlot) {
                                // Slot principal: mostrar período completo e nome do cliente
                                if (appointment._slotEndTime) {
                                    timeDisplay = `${appointment._slotStartTime} - ${appointment._slotEndTime}`;
                                } else {
                                    timeDisplay = time;
                                }
                                clientDisplay = `<div class="slot-client">${appointment.cliente_nome}</div>`;
                            } else {
                                // Slot secundário: mostrar apenas que está ocupado
                                timeDisplay = time;
                                clientDisplay = `<div class="slot-client">Ocupado</div>`;
                            }
                        }
                        
                        const slotClass = appointment ? (isMainSlot ? 'main-slot' : 'secondary-slot') : '';
                        
                        return `
                            <div class="time-slot ${status} ${slotClass}" data-time="${time}" onclick="handleTimeSlotClick('${time}', '${selectedDate}', ${appointment ? 'true' : 'false'})">
                                <div class="slot-time">${timeDisplay}</div>
                                ${clientDisplay}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <div class="period-section">
                <h3 class="period-title">🌇 Tarde</h3>
                <div class="time-slots">
                    ${workingHours.afternoon.map(time => {
                        const appointment = appointmentMap[time];
                        const status = appointment ? 'occupied' : 'available';
                        
                        let timeDisplay = time;
                        let clientDisplay = '';
                        let isMainSlot = false;
                        
                        if (appointment) {
                            // Usar a informação de slot principal/secundário que foi definida no mapeamento
                            isMainSlot = appointment._isMainSlot || false;
                            
                            if (isMainSlot) {
                                // Slot principal: mostrar período completo e nome do cliente
                                if (appointment._slotEndTime) {
                                    timeDisplay = `${appointment._slotStartTime} - ${appointment._slotEndTime}`;
                                } else {
                                    timeDisplay = time;
                                }
                                clientDisplay = `<div class="slot-client">${appointment.cliente_nome}</div>`;
                            } else {
                                // Slot secundário: mostrar apenas que está ocupado
                                timeDisplay = time;
                                clientDisplay = `<div class="slot-client">Ocupado</div>`;
                            }
                        }
                        
                        const slotClass = appointment ? (isMainSlot ? 'main-slot' : 'secondary-slot') : '';
                        
                        return `
                            <div class="time-slot ${status} ${slotClass}" data-time="${time}" onclick="handleTimeSlotClick('${time}', '${selectedDate}', ${appointment ? 'true' : 'false'})">
                                <div class="slot-time">${timeDisplay}</div>
                                ${clientDisplay}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>

        <div class="schedule-summary">
            <div class="summary-stats">
                <div class="stat-item">
                    <span class="stat-number">${availableSlots}</span>
                    <span class="stat-label">Horários Livres</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${occupiedSlots}</span>
                    <span class="stat-label">Agendamentos</span>
                </div>
                <div class="stat-item">
                    <span class="stat-number">${occupancyPercentage}%</span>
                    <span class="stat-label">Taxa de Ocupação</span>
                </div>
            </div>
        </div>
    `;
}

function renderClientsGrid(clients) {
    const container = document.getElementById('clientsGrid');
    container.innerHTML = '';
    
    clients.forEach(client => {
        const card = document.createElement('div');
        card.className = 'client-card';
        card.innerHTML = `
            <div class="client-name">${client.nome}</div>
            <div class="client-phone">${client.telefone}</div>
            <div class="client-stats">
                <span>Agendamentos: ${client.totalAgendamentos}</span>
                <span>Último: ${formatDate(client.ultimoAgendamento)}</span>
            </div>
        `;
        container.appendChild(card);
    });
}

function renderReports(data) {
    // Renderizando relatórios
    
    // Verificar se os elementos existem
    const revenueChart = document.getElementById('revenueChart');
    const servicesChart = document.getElementById('servicesChart');
    const generalStats = document.getElementById('generalStats');
    
    // Verificando elementos do DOM
    
    if (!revenueChart || !servicesChart || !generalStats) {
        console.error('Elementos dos relatórios não encontrados no DOM');
        return;
    }
    
    // Estatísticas por status
    const statusStats = {};
    let totalRevenue = 0;
    let totalPaid = 0;
    let totalPending = 0;
    
    data.forEach(appointment => {
        statusStats[appointment.status] = (statusStats[appointment.status] || 0) + 1;
        const preco = parseFloat(appointment.preco_cobrado) || 0;
        
        // Faturamento total considera apenas agendamentos concluídos
        if (appointment.status === 'concluido') {
            totalRevenue += preco;
            
            if (appointment.pagamento === 'pago') {
                totalPaid += preco;
            } else if (appointment.pagamento === 'pendente') {
                totalPending += preco;
            }
        }
    });
    
    // Estatísticas por serviço
    const serviceStats = {};
    data.forEach(appointment => {
        const servico = appointment.servico || 'Não informado';
        serviceStats[servico] = (serviceStats[servico] || 0) + 1;
    });
    
    // Atualizar gráfico de faturamento
    if (revenueChart) {
        revenueChart.innerHTML = `
            <div class="chart-item">
                <div class="chart-label">Faturamento Total</div>
                <div class="chart-value">R$ ${totalRevenue.toFixed(2)}</div>
            </div>
            <div class="chart-item">
                <div class="chart-label">Recebido</div>
                <div class="chart-value success">R$ ${totalPaid.toFixed(2)}</div>
            </div>
            <div class="chart-item">
                <div class="chart-label">Pendente</div>
                <div class="chart-value warning">R$ ${totalPending.toFixed(2)}</div>
            </div>
        `;
    }
    
    // Atualizar gráfico de serviços
    if (servicesChart) {
        const topServices = Object.entries(serviceStats)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
        
        servicesChart.innerHTML = topServices.map(([service, count]) => `
            <div class="chart-item">
                <div class="chart-label">${service}</div>
                <div class="chart-value">${count} agendamentos</div>
            </div>
        `).join('');
    }
    
    // Atualizar estatísticas gerais
    if (generalStats) {
        generalStats.innerHTML = `
            <div class="stat-item">
                <div class="stat-label">Total de Agendamentos</div>
                <div class="stat-value">${data.length}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Agendados</div>
                <div class="stat-value">${statusStats.agendado || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Confirmados</div>
                <div class="stat-value">${statusStats.confirmado || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Concluídos</div>
                <div class="stat-value">${statusStats.concluido || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Cancelados</div>
                <div class="stat-value">${statusStats.cancelado || 0}</div>
            </div>
            <div class="stat-item">
                <div class="stat-label">Taxa de Conclusão</div>
                <div class="stat-value">${data.length > 0 ? ((statusStats.concluido || 0) / data.length * 100).toFixed(1) : 0}%</div>
            </div>
        `;
    }
}

// Utilitários
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    
    try {
        let date;
        
        // Se já é um objeto Date
        if (dateString instanceof Date) {
            date = dateString;
        }
        // Se é uma string ISO completa (com horário)
        else if (typeof dateString === 'string' && dateString.includes('T')) {
            date = new Date(dateString);
        }
        // Se é uma string de data simples (YYYY-MM-DD)
        else if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
            date = new Date(dateString + 'T00:00:00');
        }
        // Outros formatos
        else {
            date = new Date(dateString);
        }
        
        // Verificar se a data é válida
        if (isNaN(date.getTime())) {
            return 'Data inválida';
        }
        
        return date.toLocaleDateString('pt-BR');
    } catch (error) {
        console.error('Erro ao formatar data:', error, dateString);
        return 'Data inválida';
    }
}

function setDateToToday(inputId = 'currentDate') {
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById(inputId);
    if (dateInput) {
        dateInput.value = today;
        
        // Disparar evento de mudança para atualizar os dados
        if (inputId === 'currentDate') {
            loadOverviewData();
        } else if (inputId === 'scheduleDate') {
            loadScheduleGrid();
        }
    }
}

function setDateToTomorrow(inputId = 'scheduleDate') {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const dateInput = document.getElementById(inputId);
    if (dateInput) {
        dateInput.value = tomorrowStr;
        
        // Disparar evento de mudança para atualizar os dados
        if (inputId === 'scheduleDate') {
            loadScheduleGrid();
        }
    }
}

// Função otimizada com debounce para filtrar clientes
const debouncedFilterClients = debounce(() => {
    const searchTerm = document.getElementById('clientSearch')?.value?.toLowerCase() || '';
    const clientCards = document.querySelectorAll('.client-card');
    
    clientCards.forEach(card => {
        const clientName = card.querySelector('.client-name')?.textContent?.toLowerCase() || '';
        const clientPhone = card.querySelector('.client-phone')?.textContent?.toLowerCase() || '';
        
        const shouldShow = !searchTerm || clientName.includes(searchTerm) || clientPhone.includes(searchTerm);
        card.style.display = shouldShow ? 'block' : 'none';
    });
}, 300);

// Função legacy mantida para compatibilidade
function filterClients() {
    debouncedFilterClients();
}

function updateReportData() {
    loadReports();
}

function filterAppointments() {
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    // Esta função pode ser implementada se necessário
}

function updateReportData() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (startDate && endDate) {
        loadReports();
    }
}

// Modal de edição
async function editAppointment(id) {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível editar agendamento');
        alert('Erro: Supabase não configurado. Configure o arquivo config.js');
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('agendamentos')
            .select('*')
            .eq('id', id)
            .single();
        
        if (error) throw error;
        
        const appointment = data;
        
        // Preencher campos do modal
        document.getElementById('editId').value = appointment.id;
        
        // Extrair data e horário do timestamp
        const appointmentDate = new Date(appointment.data_horario);
        document.getElementById('editData').value = appointmentDate.toISOString().split('T')[0];
        
        // Garantir formato HH:MM para o horário de início
        let timeStartValue = appointment.horario_inicio;
        if (!timeStartValue) {
            const hours = appointmentDate.getHours().toString().padStart(2, '0');
            const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
            timeStartValue = `${hours}:${minutes}`;
        }
        // Remover segundos se existirem (formato HH:MM:SS -> HH:MM)
        if (timeStartValue.includes(':') && timeStartValue.split(':').length === 3) {
            timeStartValue = timeStartValue.substring(0, 5);
        }
        document.getElementById('editHorarioInicio').value = timeStartValue;
        
        // Garantir formato HH:MM para o horário de fim
        let timeEndValue = appointment.horario_fim;
        if (!timeEndValue) {
            // Se não tiver horário de fim, calcular baseado no início + 30 min
            timeEndValue = calculateEndTime(timeStartValue, 30);
        }
        // Remover segundos se existirem (formato HH:MM:SS -> HH:MM)
        if (timeEndValue.includes(':') && timeEndValue.split(':').length === 3) {
            timeEndValue = timeEndValue.substring(0, 5);
        }
        document.getElementById('editHorarioFim').value = timeEndValue;
        
        // Preencher nome e telefone do cliente
        document.getElementById('editNome').value = appointment.cliente_nome || '';
        document.getElementById('editTelefone').value = appointment.telefone || '';
        
        document.getElementById('editServico').value = appointment.servico || '';
        document.getElementById('editStatus').value = appointment.status || 'agendado';
        document.getElementById('editObservacoes').value = appointment.observacoes || '';
        document.getElementById('editPreco').value = appointment.preco_cobrado || '';
        document.getElementById('editFormaPagamento').value = appointment.forma_pagamento || '';
        document.getElementById('editPagamento').value = appointment.pagamento || '';
        
        // Mostrar modal
        document.getElementById('editModal').style.display = 'block';
    } catch (error) {
        console.error('Erro ao carregar agendamento:', error);
        alert('Erro ao carregar dados do agendamento: ' + error.message);
    }
}

async function saveAppointment() {
    // Salvando agendamento...
    
    try {
        // Obter dados do formulário
        const id = document.getElementById('editId').value;
        const clienteNome = document.getElementById('editNome').value.trim();
        const clienteTelefone = document.getElementById('editTelefone').value.trim();
        const data = document.getElementById('editData').value;
        const horarioInicio = document.getElementById('editHorarioInicio').value;
        const horarioFim = document.getElementById('editHorarioFim').value;
        const servico = document.getElementById('editServico').value;
        const status = document.getElementById('editStatus').value;
        const observacoes = document.getElementById('editObservacoes').value.trim();
        const precoElement = document.getElementById('editPreco');
        const precoValue = precoElement?.value;
        const preco = parseFloat(precoValue || 0);
        const formaPagamento = document.getElementById('editFormaPagamento').value;
        const pagamento = document.getElementById('editPagamento').value;
        
        // Validando dados do formulário
        
        // Validações básicas
        if (!id || !clienteNome || !data || !horarioInicio || !horarioFim || !servico) {
            // Validação falhou - campos obrigatórios
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        
        // Validar formato dos horários (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(horarioInicio) || !timeRegex.test(horarioFim)) {
            // Validação falhou - formato de horário inválido
            alert('Formato de horário inválido. Use HH:MM (ex: 14:30)');
            return;
        }
        
        // Validar se horário de fim é posterior ao de início
        if (horarioFim <= horarioInicio) {
            alert('O horário de fim deve ser posterior ao horário de início.');
            return;
        }
        
        // Combinar data e horário em um timestamp válido
        const dataHorario = new Date(`${data}T${horarioInicio}:00`);
        // Data/horário validados
        
        // Verificar se a data é válida
        if (isNaN(dataHorario.getTime())) {
            // Data/horário inválido
            alert('Data ou horário inválido');
            return;
        }
        
        if (!supabaseClient) {
            console.error('❌ Supabase não configurado - não é possível salvar agendamento');
            alert('Erro: Supabase não configurado. Configure o arquivo config.js');
            return;
        }
        
        // Salvando no Supabase
        
        // Verificar conflitos de horário no Supabase (excluindo o próprio agendamento)
        const conflictCheck = await checkTimeConflictSupabase(data, horarioInicio, horarioFim, id);
        if (conflictCheck.conflict) {
            alert(`Este horário conflita com o agendamento de ${conflictCheck.conflictWith.cliente_nome} (${conflictCheck.conflictWith.horario_inicio} - ${conflictCheck.conflictWith.horario_fim}). Por favor, escolha outro horário.`);
            return;
        }
        
        // Buscar ou criar cliente
        const cliente = await findOrCreateClient(clienteTelefone, clienteNome);
        if (!cliente) {
            throw new Error('Erro ao processar dados do cliente');
        }
        
        // Buscar serviço
        const servicoData = services.find(s => s.nome === servico);
        if (!servicoData) {
            throw new Error('Serviço não encontrado');
        }
        
        // Preparar dados para o Supabase
        const updatedData = {
            cliente_id: cliente.id,
            servico_id: servicoData.id,
            data_horario: dataHorario.toISOString(),
            horario_inicio: horarioInicio,
            horario_fim: horarioFim,
            preco_cobrado: preco,
            status: status,
            observacoes: observacoes || null
        };
        
        // Dados preparados para atualização
        
        const { data: result, error } = await supabaseClient
            .from('agendamentos')
            .update(updatedData)
            .eq('id', parseInt(id))
            .select();
        
        // Se o agendamento foi concluído e há valor a pagar, criar registro de pagamento
        if (status === 'concluido' && preco > 0) {
            const valorPago = pagamento === 'pago' ? preco : 0;
            const valorPendente = preco - valorPago;
            
            // Verificar se já existe um pagamento para este agendamento
            const { data: existingPayment } = await supabaseClient
                .from('pagamentos')
                .select('id')
                .eq('agendamento_id', parseInt(id))
                .single();
            
            const paymentData = {
                agendamento_id: parseInt(id),
                cliente_id: cliente.id,
                valor_total: preco,
                valor_pago: valorPago,
                valor_pendente: valorPendente,
                status: pagamento === 'pago' ? 'pago' : 'pendente',
                forma_pagamento: formaPagamento || null,
                data_pagamento: pagamento === 'pago' ? new Date().toISOString() : null
            };
            
            if (existingPayment) {
                // Atualizar pagamento existente
                await supabaseClient
                    .from('pagamentos')
                    .update(paymentData)
                    .eq('id', existingPayment.id);
            } else {
                // Criar novo pagamento
                await supabaseClient
                    .from('pagamentos')
                    .insert(paymentData);
            }
        }
        
        if (error) {
            // Erro do Supabase
            throw error;
        }
        
        // Atualização concluída
        
        closeModal();
        loadAppointments();
        loadTodayAppointments();
        loadOverviewData();
        loadScheduleGrid();
        
        alert('Agendamento atualizado com sucesso!');
        // Agendamento salvo com sucesso
        
    } catch (error) {
        console.error('Erro ao salvar agendamento:', error);
        alert('Erro ao salvar agendamento: ' + (error.message || 'Erro desconhecido'));
    }
}

async function deleteAppointment(id) {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) {
        return;
    }
    
    // Excluindo agendamento...
    
    try {
        if (!supabaseClient) {
            console.error('❌ Supabase não configurado - não é possível excluir agendamento');
            alert('Erro: Supabase não configurado. Configure o arquivo config.js');
            return;
        }
        
        // Excluindo do Supabase
        
        const { data: result, error } = await supabaseClient
            .from('agendamentos')
            .delete()
            .eq('id', parseInt(id));
        
        if (error) {
            // Erro do Supabase
            throw error;
        }
        
        // Exclusão concluída
        
        // Recarregar todas as visualizações
        await loadAppointments();
        await loadTodayAppointments();
        await loadOverviewData();
        await loadScheduleGrid();
        await loadAllClients(); // Recarregar clientes também
        
        alert('Agendamento excluído com sucesso!');
        // Agendamento excluído com sucesso
        
    } catch (error) {
        console.error('Erro ao excluir agendamento:', error);
        alert('Erro ao excluir agendamento: ' + (error.message || 'Erro desconhecido'));
    }
}

// Função para excluir cliente (versão antiga - mantida para compatibilidade)
async function deleteClientOld(telefone) {
    if (!confirm('Tem certeza que deseja excluir este cliente? Todos os agendamentos relacionados também serão excluídos.')) {
        return;
    }
    
    try {
        if (!supabaseClient) {
            showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
            return;
        }
        
        showLoading();
        
        // Buscar cliente pelo telefone
        const normalizedPhone = normalizePhone(telefone);
        const { data: clientData, error: clientError } = await supabaseClient
            .from('clientes')
            .select('id, nome')
            .eq('telefone', normalizedPhone)
            .single();
        
        if (clientError && clientError.code !== 'PGRST116') {
            throw clientError;
        }
        
        if (clientData) {
            // Usar a nova função de exclusão
            await deleteClient(clientData.id, clientData.nome);
        } else {
            showNotification('Cliente não encontrado.', 'warning');
        }
        
    } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        showNotification('Erro ao excluir cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

function closeModal() {
    document.getElementById('editModal').style.display = 'none';
    selectedClientId = null;
    
    // Limpar sugestões
    const suggestionsContainer = document.getElementById('clientSuggestions');
    if (suggestionsContainer) {
        suggestionsContainer.style.display = 'none';
    }
}

// Loading
function showLoading() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loadingOverlay').style.display = 'none';
}

// Variáveis globais para o sistema de clientes
let allClients = [];
let selectedClientId = null;

// Função para carregar todos os clientes
async function loadAllClients() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar clientes');
        return [];
    }
    
    try {
        // Buscar clientes da tabela clientes
        const { data, error } = await supabaseClient
            .from('clientes')
            .select('id, nome, telefone, email')
            .order('nome');
        
        if (error) throw error;
        
        return data || [];
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        return [];
    }
}

// Função para configurar o autocomplete de clientes
function setupClientAutocomplete() {
    const clientInput = document.getElementById('editNome');
    const suggestionsContainer = document.getElementById('clientSuggestions');
    
    if (!clientInput || !suggestionsContainer) return;
    
    let selectedIndex = -1;
    
    clientInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        selectedClientId = null;
        
        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        const filteredClients = allClients.filter(client => 
            client.nome.toLowerCase().includes(query) ||
            client.telefone.includes(query)
        );
        
        if (filteredClients.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        suggestionsContainer.innerHTML = '';
        filteredClients.forEach((client, index) => {
            const suggestion = document.createElement('div');
            suggestion.className = 'client-suggestion';
            suggestion.innerHTML = `
                <div class="client-suggestion-name">${client.nome}</div>
                <div class="client-suggestion-phone">${client.telefone}</div>
            `;
            
            suggestion.addEventListener('click', () => {
                selectClient(client);
            });
            
            suggestionsContainer.appendChild(suggestion);
        });
        
        suggestionsContainer.style.display = 'block';
        selectedIndex = -1;
    });
    
    // Navegação com teclado
    clientInput.addEventListener('keydown', function(e) {
        const suggestions = suggestionsContainer.querySelectorAll('.client-suggestion');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
            updateSelectedSuggestion(suggestions);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelectedSuggestion(suggestions);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                const clientName = suggestions[selectedIndex].querySelector('.client-suggestion-name').textContent;
                const clientPhone = suggestions[selectedIndex].querySelector('.client-suggestion-phone').textContent;
                const client = allClients.find(c => c.nome === clientName && c.telefone === clientPhone);
                if (client) {
                    selectClient(client);
                }
            }
        } else if (e.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
            selectedIndex = -1;
        }
    });
    
    // Fechar sugestões ao clicar fora
    document.addEventListener('click', function(e) {
        if (!clientInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
            selectedIndex = -1;
        }
    });
    
    function updateSelectedSuggestion(suggestions) {
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('selected', index === selectedIndex);
        });
    }
    
    function selectClient(client) {
        clientInput.value = client.nome;
        selectedClientId = client.id;
        suggestionsContainer.style.display = 'none';
        selectedIndex = -1;
        
        // Preencher telefone automaticamente se houver campo
        const phoneField = document.getElementById('editTelefone');
        if (phoneField) {
            phoneField.value = client.telefone;
        }
    }
}

// Função para buscar nome do cliente por telefone
async function getClientNameByPhone(phone) {
    if (!supabaseClient) {
        const client = allClients.find(c => c.telefone === phone);
        return client ? client.nome : `Cliente: ${phone}`;
    }
    
    try {
        const normalizedPhone = normalizePhone(phone);
        const { data, error } = await supabaseClient
            .from('clientes')
            .select('nome')
            .eq('telefone', normalizedPhone)
            .limit(1)
            .single();
        
        if (error) throw error;
        return data?.nome || `Cliente: ${phone}`;
    } catch (error) {
        console.error('Erro ao buscar nome do cliente:', error);
        return `Cliente: ${phone}`;
    }
}

// Funções de renderização removidas - usando a função principal

// Função renderTodaySchedule removida - usando a função principal

function renderClientsGrid(clients) {
    const container = document.getElementById('clientsGrid');
    if (!container) return;
    
    container.innerHTML = '';
    
    clients.forEach(client => {
        const card = document.createElement('div');
        card.className = 'client-card';
        
        // Formatar telefone para exibição
        const formattedPhone = formatPhoneDisplay(client.telefone);
        
        card.innerHTML = `
            <div class="client-header">
                <h4>${client.nome}</h4>
                <button class="client-delete-btn" onclick="deleteClient(${client.id}, '${client.nome}')" title="Excluir Cliente">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
            <div class="client-info">
                <p><strong>Telefone:</strong> <span class="client-phone">${formattedPhone}</span></p>
                <p><strong>Total de Agendamentos:</strong> ${client.totalAgendamentos || 0}</p>
                <p><strong>Último Agendamento:</strong> ${client.ultimoAgendamento ? new Date(client.ultimoAgendamento).toLocaleDateString('pt-BR') : 'Nunca'}</p>
            </div>
        `;
        container.appendChild(card);
    });
}



// Função para mostrar notificações
function showNotification(message, type = 'info') {
    // Remover notificação existente se houver
    const existingNotification = document.querySelector('.notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Adicionar ao body
    document.body.appendChild(notification);
    
    // Remover após 3 segundos
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 3000);
}

// Função para abrir modal de adicionar agendamento
function openAddAppointmentModal() {
    // Definir data de hoje por padrão
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('addData').value = today;
    
    // Limpar campos
    document.getElementById('addNome').value = '';
    document.getElementById('addTelefone').value = '';
    document.getElementById('addServico').value = '';
    document.getElementById('addHorarioInicio').value = '';
    document.getElementById('addHorarioFim').value = '';
    document.getElementById('addPreco').value = '';
    document.getElementById('addStatus').value = 'agendado';
    document.getElementById('addObservacoes').value = '';
    
    // Mostrar modal
    document.getElementById('addModal').style.display = 'block';
}

// Função para fechar modal de adicionar agendamento
function closeAddModal() {
    document.getElementById('addModal').style.display = 'none';
}

// Função para atualizar preço baseado no serviço selecionado (modal adicionar)
function updateAddServicePrice() {
    const servicoSelect = document.getElementById('addServico');
    const precoInput = document.getElementById('addPreco');
    
    // Limpar o campo de preço para que o barbeiro defina
    if (servicoSelect.value) {
        precoInput.value = '';
        precoInput.focus();
    } else {
        precoInput.value = '';
    }
}

// Função para atualizar preço baseado no serviço selecionado (modal editar)
function updateEditServicePrice() {
    const servicoSelect = document.getElementById('editServico');
    const precoInput = document.getElementById('editPreco');
    
    // Limpar o campo de preço para que o barbeiro defina
    if (servicoSelect.value) {
        precoInput.focus();
    }
}

// Função para atualizar preço baseado no serviço selecionado (modal inadimplentes)
function updateUnpaidServicePrice() {
    const servicoSelect = document.getElementById('addUnpaidServico');
    const precoInput = document.getElementById('addUnpaidValor');
    
    // Limpar o campo de preço para que o barbeiro defina
    if (servicoSelect.value && precoInput) {
        precoInput.value = '';
        precoInput.focus();
    }
}

// Função para adicionar novo agendamento
async function addNewAppointment(event) {
    event.preventDefault();
    
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível criar agendamento');
        alert('Erro: Supabase não configurado. Configure o arquivo config.js');
        return;
    }
    
    try {
        const clienteNome = document.getElementById('addNome').value.trim();
        const clienteTelefone = document.getElementById('addTelefone').value.trim();
        const servico = document.getElementById('addServico').value;
        const data = document.getElementById('addData').value;
        const horarioInicio = document.getElementById('addHorarioInicio').value;
        const horarioFim = document.getElementById('addHorarioFim').value;
        const preco = parseFloat(document.getElementById('addPreco').value) || 0;
        const status = document.getElementById('addStatus').value;
        const observacoes = document.getElementById('addObservacoes').value.trim();
        
        // Validações detalhadas
        console.log('Validando campos:', {
            clienteNome,
            servico,
            data,
            horarioInicio,
            horarioFim,
            preco
        });
        
        if (!clienteNome) {
            alert('Por favor, preencha o nome do cliente.');
            document.getElementById('addNome').focus();
            return;
        }
        
        if (!servico) {
            alert('Por favor, selecione um serviço.');
            document.getElementById('addServico').focus();
            return;
        }
        
        if (!data) {
            alert('Por favor, selecione uma data.');
            document.getElementById('addData').focus();
            return;
        }
        
        if (!horarioInicio) {
            alert('Por favor, selecione o horário de início.');
            document.getElementById('addHorarioInicio').focus();
            return;
        }
        
        if (!horarioFim) {
            alert('Por favor, selecione o horário de fim.');
            document.getElementById('addHorarioFim').focus();
            return;
        }
        
        if (!preco || preco <= 0) {
            alert('Por favor, informe o preço do serviço.');
            document.getElementById('addPreco').focus();
            return;
        }
        
        // Validar se horário de fim é posterior ao de início
        if (horarioFim <= horarioInicio) {
            alert('O horário de fim deve ser posterior ao horário de início.');
            return;
        }
        
        // Verificar conflitos de horário no Supabase
        const conflictCheck = await checkTimeConflictSupabase(data, horarioInicio, horarioFim);
        if (conflictCheck.conflict) {
            alert(`Este horário conflita com o agendamento de ${conflictCheck.conflictWith.cliente_nome} (${conflictCheck.conflictWith.horario_inicio} - ${conflictCheck.conflictWith.horario_fim}). Por favor, escolha outro horário.`);
            return;
        }
        
        // Buscar ou criar cliente
        const cliente = await findOrCreateClient(clienteTelefone, clienteNome);
        if (!cliente) {
            throw new Error('Erro ao processar dados do cliente');
        }
        
        // Buscar serviço
        const servicoData = services.find(s => s.nome === servico);
        if (!servicoData) {
            throw new Error('Serviço não encontrado');
        }
        
        // Combinar data e horário em um timestamp
        const dataHorario = new Date(`${data}T${horarioInicio}:00`);
        
        const newAppointment = {
            cliente_id: cliente.id,
            servico_id: servicoData.id,
            data_horario: dataHorario.toISOString(),
            horario_inicio: horarioInicio,
            horario_fim: horarioFim,
            preco_cobrado: preco,
            status: status,
            observacoes: observacoes || null
        };
        
        console.log('Dados do agendamento:', newAppointment);
        
        const { data: insertedData, error } = await supabaseClient
            .from('agendamentos')
            .insert([newAppointment])
            .select();
        
        if (error) throw error;
        
        // Fechar modal e recarregar dados
        closeAddModal();
        loadAppointments();
        loadTodayAppointments();
        loadOverviewData();
        loadScheduleGrid();
        
        showNotification('Agendamento criado com sucesso!', 'success');
        
    } catch (error) {
        console.error('Erro ao adicionar agendamento:', error);
        showNotification('Erro ao criar agendamento: ' + error.message, 'error');
    }
}
function handleTimeSlotClick(time, date, isOccupied) {
    if (isOccupied === 'true') {
        showNotification('Este horário já está ocupado', 'warning');
        return;
    }

    // Abrir modal de agendamento com horário pré-selecionado
    document.getElementById('addData').value = date;
    document.getElementById('addHorarioInicio').value = time;
    // Calcular horário de fim (30 min depois por padrão)
    const endTime = calculateEndTime(time, 30);
    document.getElementById('addHorarioFim').value = endTime;
    document.getElementById('addNome').value = '';
    document.getElementById('addTelefone').value = '';
    document.getElementById('addServico').value = '';
    document.getElementById('addPreco').value = '';
    document.getElementById('addStatus').value = 'agendado';
    document.getElementById('addObservacoes').value = '';
    
    // Mostrar modal de adicionar agendamento
    document.getElementById('addModal').style.display = 'block';
    
    showNotification(`Horário ${time} selecionado para agendamento`, 'success');
}

// Função para definir data para hoje
function setToday() {
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    document.getElementById('scheduleDate').value = todayString;
    loadScheduleGrid();
}

// Função para definir data para amanhã
function setTomorrow() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowString = tomorrow.toISOString().split('T')[0];
    document.getElementById('scheduleDate').value = tomorrowString;
    loadScheduleGrid();
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modal = document.getElementById('editModal');
    if (event.target === modal) {
        closeModal();
    }
}

// Adicionar event listeners quando o DOM estiver carregado
document.addEventListener('DOMContentLoaded', function() {
    // Tornar funções disponíveis globalmente
window.editAppointment = editAppointment;
window.deleteAppointment = deleteAppointment;
window.updateEditServicePrice = updateEditServicePrice;
window.testViewData = testViewData;
window.compareAppointmentData = compareAppointmentData;
window.testDirectQueries = testDirectQueries;
window.loadAppointmentsDirect = loadAppointmentsDirect;
window.loadTodayAppointmentsDirect = loadTodayAppointmentsDirect;
window.testBothApproaches = testBothApproaches;
window.switchToDirectMode = switchToDirectMode;
window.switchToViewMode = switchToViewMode;

// Função de debug para verificar dados da view
async function debugViewData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🔍 Testando consulta direta na view...');
        
        const { data, error } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*')
            .limit(5);
        
        if (error) {
            console.error('❌ Erro na consulta:', error);
            return;
        }
        
        console.log('✅ Dados da view (primeiros 5):', data);
        
        if (data && data.length > 0) {
            console.log('📋 Estrutura do primeiro registro:', Object.keys(data[0]));
            console.log('📋 Primeiro registro completo:', data[0]);
        }
        
        return data;
        
    } catch (error) {
        console.error('❌ Erro ao testar view:', error);
    }
}

window.debugViewData = debugViewData;

// Função para restaurar funcionamento básico
async function restoreBasicFunctionality() {
    console.log('🔧 Restaurando funcionamento básico...');
    
    try {
        // Limpar arrays
        appointments = [];
        todayAppointments = [];
        
        // Recarregar dados
        await loadDashboardData();
        
        console.log('✅ Funcionamento básico restaurado');
        
    } catch (error) {
        console.error('❌ Erro ao restaurar funcionamento:', error);
    }
}

window.restoreBasicFunctionality = restoreBasicFunctionality;

// Função para testar se há dados na view
async function testViewHasData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🔍 Testando se há dados na view...');
        
        // Testar contagem total
        const { count, error: countError } = await supabaseClient
            .from('vw_agendamentos_completos')
            .select('*', { count: 'exact', head: true });
        
        if (countError) {
            console.error('❌ Erro ao contar registros:', countError);
            return;
        }
        
        console.log(`📊 Total de registros na view: ${count}`);
        
        if (count === 0) {
            console.log('⚠️ A view não tem dados. Vamos verificar as tabelas base...');
            
            // Verificar tabela agendamentos
            const { count: agendamentosCount } = await supabaseClient
                .from('agendamentos')
                .select('*', { count: 'exact', head: true });
            
            console.log(`📊 Total de agendamentos: ${agendamentosCount}`);
            
            // Verificar tabela clientes
            const { count: clientesCount } = await supabaseClient
                .from('clientes')
                .select('*', { count: 'exact', head: true });
            
            console.log(`📊 Total de clientes: ${clientesCount}`);
            
            // Verificar tabela servicos
            const { count: servicosCount } = await supabaseClient
                .from('servicos')
                .select('*', { count: 'exact', head: true });
            
            console.log(`📊 Total de serviços: ${servicosCount}`);
            
            if (agendamentosCount === 0) {
                console.log('⚠️ Não há agendamentos na base de dados');
                return { hasData: false, reason: 'no_appointments' };
            }
        }
        
        // Se há dados, buscar alguns exemplos
        if (count > 0) {
            const { data, error } = await supabaseClient
                .from('vw_agendamentos_completos')
                .select('*')
                .limit(3);
            
            if (error) {
                console.error('❌ Erro ao buscar dados:', error);
                return;
            }
            
            console.log('✅ Exemplos de dados da view:', data);
            return { hasData: true, count, examples: data };
        }
        
    } catch (error) {
        console.error('❌ Erro ao testar view:', error);
    }
}

window.testViewHasData = testViewHasData;

// Função para inserir dados de teste
async function insertTestData() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    
    try {
        console.log('🔧 Inserindo dados de teste...');
        
        // 1. Inserir cliente de teste
        const { data: cliente, error: clienteError } = await supabaseClient
            .from('clientes')
            .upsert({
                telefone: '11999999999',
                nome: 'Cliente Teste',
                email: 'teste@email.com'
            })
            .select()
            .single();
        
        if (clienteError) {
            console.error('❌ Erro ao inserir cliente:', clienteError);
            return;
        }
        
        console.log('✅ Cliente inserido:', cliente);
        
        // 2. Inserir serviço de teste
        const { data: servico, error: servicoError } = await supabaseClient
            .from('servicos')
            .upsert({
                nome: 'Corte Teste',
                preco_base: 30.00,
                duracao_minutos: 30
            })
            .select()
            .single();
        
        if (servicoError) {
            console.error('❌ Erro ao inserir serviço:', servicoError);
            return;
        }
        
        console.log('✅ Serviço inserido:', servico);
        
        // 3. Inserir agendamento de teste para hoje
        const hoje = new Date();
        const dataHorario = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 14, 0, 0);
        
        const { data: agendamento, error: agendamentoError } = await supabaseClient
            .from('agendamentos')
            .insert({
                cliente_id: cliente.id,
                servico_id: servico.id,
                data_horario: dataHorario.toISOString(),
                horario_inicio: '14:00',
                horario_fim: '14:30',
                preco_cobrado: 30.00,
                status: 'agendado'
            })
            .select()
            .single();
        
        if (agendamentoError) {
            console.error('❌ Erro ao inserir agendamento:', agendamentoError);
            return;
        }
        
        console.log('✅ Agendamento inserido:', agendamento);
        
        // 4. Testar a view novamente
        await testViewHasData();
        
        // 5. Recarregar dados
        await restoreBasicFunctionality();
        
        console.log('✅ Dados de teste inseridos com sucesso!');
        
    } catch (error) {
        console.error('❌ Erro ao inserir dados de teste:', error);
    }
}

window.insertTestData = insertTestData;

// Função de diagnóstico completo
async function fullDiagnostic() {
    console.log('🔍 === DIAGNÓSTICO COMPLETO ===');
    
    // 1. Verificar configuração do Supabase
    console.log('1. Verificando configuração do Supabase...');
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado');
        return;
    }
    console.log('✅ Supabase configurado');
    
    // 2. Verificar variáveis globais
    console.log('2. Verificando variáveis globais...');
    console.log('appointments:', typeof appointments, appointments?.length || 0);
    console.log('todayAppointments:', typeof todayAppointments, todayAppointments?.length || 0);
    
    // 3. Testar dados na view
    console.log('3. Testando dados na view...');
    const viewResult = await testViewHasData();
    
    // 4. Se não há dados, sugerir inserir dados de teste
    if (viewResult && !viewResult.hasData) {
        console.log('⚠️ Não há dados na view. Execute insertTestData() para inserir dados de teste.');
        return;
    }
    
    // 5. Testar carregamento de dados
    console.log('4. Testando carregamento de dados...');
    try {
        await loadAppointments();
        await loadTodayAppointments();
        console.log('✅ Dados carregados com sucesso');
        console.log('appointments final:', appointments?.length || 0);
        console.log('todayAppointments final:', todayAppointments?.length || 0);
    } catch (error) {
        console.error('❌ Erro ao carregar dados:', error);
    }
    
    // 6. Verificar renderização
    console.log('5. Verificando renderização...');
    const container = document.getElementById('todayScheduleList');
    if (container) {
        console.log('✅ Container encontrado');
        console.log('HTML atual:', container.innerHTML.substring(0, 200) + '...');
    } else {
        console.error('❌ Container todayScheduleList não encontrado');
    }
    
    console.log('🔍 === FIM DO DIAGNÓSTICO ===');
}

window.fullDiagnostic = fullDiagnostic;

// Função para reinicializar completamente o sistema
async function fullReset() {
    console.log('🔄 === REINICIALIZAÇÃO COMPLETA ===');
    
    try {
        // 1. Limpar variáveis globais
        console.log('1. Limpando variáveis globais...');
        appointments = [];
        todayAppointments = [];
        
        // 2. Limpar containers
        console.log('2. Limpando containers...');
        const todayContainer = document.getElementById('todayScheduleList');
        const tableBody = document.getElementById('appointmentsTableBody');
        
        if (todayContainer) {
            todayContainer.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Carregando...</p>';
        }
        
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: rgba(255,255,255,0.5);">Carregando...</td></tr>';
        }
        
        // 3. Definir datas padrão
        console.log('3. Definindo datas padrão...');
        const today = new Date().toISOString().split('T')[0];
        const currentDateInput = document.getElementById('currentDate');
        const scheduleDateInput = document.getElementById('scheduleDate');
        
        if (currentDateInput) {
            currentDateInput.value = today;
        }
        
        if (scheduleDateInput) {
            scheduleDateInput.value = today;
        }
        
        // 4. Aguardar um pouco
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // 5. Recarregar todos os dados
        console.log('4. Recarregando dados...');
        await loadDashboardData();
        
        console.log('✅ Reinicialização completa finalizada!');
        console.log('appointments:', appointments?.length || 0);
        console.log('todayAppointments:', todayAppointments?.length || 0);
        
    } catch (error) {
        console.error('❌ Erro durante reinicialização:', error);
    }
}

window.fullReset = fullReset;
    
    // Event listener para o formulário de edição
    const editForm = document.getElementById('editForm');
    if (editForm) {
        editForm.addEventListener('submit', function(event) {
            event.preventDefault();
            saveAppointment();
        });
    }
    
    // Event listener para tecla Enter no modal de edição
    const editModal = document.getElementById('editModal');
    if (editModal) {
        editModal.addEventListener('keydown', function(event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                // Permitir Enter em textarea
                if (event.target.tagName.toLowerCase() === 'textarea') {
                    return;
                }
                event.preventDefault();
                saveAppointment();
            }
            if (event.key === 'Escape') {
                closeModal();
            }
        });
    }
    
    // Melhorar o botão de salvar
    const saveButton = document.querySelector('#editModal .btn-save');
    if (saveButton) {
        saveButton.addEventListener('click', function(event) {
            event.preventDefault();
            saveAppointment();
        });
    }
    
    // Funções disponíveis globalmente
});

// ==================== FUNÇÕES PARA INADIMPLENTES ====================

// Função para carregar clientes inadimplentes
async function loadUnpaidClients() {
    if (!supabaseClient) {
        console.error('❌ Supabase não configurado - não é possível carregar inadimplentes');
        alert('Erro: Supabase não configurado. Configure o arquivo config.js');
        return;
    }
    
    try {
        showLoading();
        
        // Primeiro, atualizar a lista de inadimplentes
        await updateUnpaidList();
        
        const filterClient = document.getElementById('unpaidClientFilter').value.trim();
        
        // Buscar inadimplentes com JOIN nas tabelas
        let query = supabaseClient
            .from('inadimplentes')
            .select(`
                *,
                clientes!inner(nome, telefone),
                agendamentos!inner(data_horario, servicos!inner(nome))
            `)
            .eq('status_cobranca', 'pendente')
            .gt('valor_restante', 0)
            .order('dias_atraso', { ascending: false });
        
        // Filtrar por cliente se especificado
        if (filterClient) {
            query = query.or(`clientes.nome.ilike.%${filterClient}%,clientes.telefone.ilike.%${filterClient}%`);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        const unpaidClients = data || [];
        renderUnpaidTable(unpaidClients);
        updateUnpaidSummary(unpaidClients);
        
    } catch (error) {
        console.error('Erro ao carregar inadimplentes:', error);
        showNotification('Erro ao carregar clientes inadimplentes: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para atualizar lista de inadimplentes no banco
async function updateUnpaidList() {
    if (!supabaseClient) return;
    
    try {
        // Buscar inadimplentes e calcular dias de atraso no frontend
        const { data: inadimplentes, error } = await supabaseClient
            .from('inadimplentes')
            .select('*')
            .neq('status_cobranca', 'quitado');
        
        if (error) throw error;
        
        // Atualizar dias de atraso para cada inadimplente
        for (const inadimplente of inadimplentes || []) {
            const dataVencimento = new Date(inadimplente.data_vencimento);
            const hoje = new Date();
            const diasAtraso = Math.max(0, Math.floor((hoje - dataVencimento) / (1000 * 60 * 60 * 24)));
            
            if (diasAtraso !== inadimplente.dias_atraso) {
                await supabaseClient
                    .from('inadimplentes')
                    .update({ dias_atraso: diasAtraso })
                    .eq('id', inadimplente.id);
            }
        }
        
        // Lista atualizada com sucesso
    } catch (error) {
        console.error('Erro ao atualizar lista de inadimplentes:', error);
    }
}



// Função para renderizar tabela de inadimplentes
function renderUnpaidTable(unpaidClients) {
    const tbody = document.getElementById('unpaidTableBody');
    if (!tbody) return;
    
    if (unpaidClients.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 2rem; color: rgba(255, 255, 255, 0.6);">
                    <i class="fas fa-check-circle" style="font-size: 2rem; margin-bottom: 1rem; color: #4CAF50;"></i>
                    <br>
                    Nenhum cliente inadimplente encontrado!
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = unpaidClients.map(client => {
        const serviceDate = new Date(client.agendamentos.data_horario);
        const overdueClass = client.dias_atraso > 30 ? 'critical' : '';
        
        return `
            <tr>
                <td>${client.clientes.nome}</td>
                <td>${formatPhoneDisplay(client.clientes.telefone)}</td>
                <td>${client.agendamentos.servicos.nome}</td>
                <td>${serviceDate.toLocaleDateString('pt-BR')}</td>
                <td>R$ ${client.valor_devido.toFixed(2)}</td>
                <td>
                    <span class="overdue-days ${overdueClass}">
                        ${client.dias_atraso} dias
                    </span>
                </td>
                <td>
                    <div class="unpaid-actions">
                        <button class="mark-paid-btn" onclick="markAsPaid(${client.agendamento_id})">
                            <i class="fas fa-check"></i>
                            Marcar Pago
                        </button>
                        <button class="contact-btn" onclick="contactClient('${client.clientes.telefone}', '${client.clientes.nome}', ${client.agendamento_id})">
                            <i class="fas fa-phone"></i>
                            Contatar
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// Função para atualizar resumo de inadimplentes
function updateUnpaidSummary(unpaidClients) {
    const totalClients = unpaidClients.length;
    // Usar valor_devido se disponível, senão usar preco_cobrado
    const totalAmount = unpaidClients.reduce((sum, client) => {
        const valor = client.valor_devido || client.preco_cobrado || 0;
        return sum + parseFloat(valor);
    }, 0);
    
    document.getElementById('totalUnpaidClients').textContent = totalClients;
    document.getElementById('totalUnpaidAmount').textContent = `R$ ${totalAmount.toFixed(2)}`;
    
    // Remover a seção "Mais Antigo" - não é mais necessária
    const oldestElement = document.getElementById('oldestUnpaid');
    if (oldestElement) {
        oldestElement.textContent = '-';
    }
}

// Função para marcar como pago
async function markAsPaid(appointmentId) {
    if (!confirm('Confirma que este pagamento foi realizado?')) {
        return;
    }
    
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        // Buscar o valor devido antes de atualizar
        const { data: inadimplente } = await supabaseClient
            .from('inadimplentes')
            .select('valor_devido')
            .eq('agendamento_id', appointmentId)
            .single();
        
        // Atualizar status do inadimplente para quitado
        const { error: inadimplenteError } = await supabaseClient
            .from('inadimplentes')
            .update({ 
                status_cobranca: 'quitado',
                valor_pago: inadimplente?.valor_devido || 0
            })
            .eq('agendamento_id', appointmentId);
        
        if (inadimplenteError) throw inadimplenteError;
        
        // Criar registro de pagamento
        const { data: agendamento } = await supabaseClient
            .from('agendamentos')
            .select('preco_cobrado')
            .eq('id', appointmentId)
            .single();
        
        if (agendamento) {
            await supabaseClient
                .from('pagamentos')
                .insert({
                    agendamento_id: appointmentId,
                    valor_pago: agendamento.preco_cobrado,
                    forma_pagamento: 'dinheiro',
                    status_pagamento: 'aprovado',
                    data_pagamento: new Date().toISOString()
                });
        }
        
        showNotification('Pagamento marcado como realizado!', 'success');
        loadUnpaidClients(); // Recarregar lista
        
    } catch (error) {
        console.error('Erro ao marcar como pago:', error);
        showNotification('Erro ao atualizar pagamento: ' + error.message, 'error');
    }
}

// Função para contatar cliente
async function contactClient(phone, name, appointmentId) {
    const normalizedPhone = normalizePhone(phone);
    const message = `Olá ${name}! Esperamos que esteja bem. Gostaríamos de lembrar sobre o pagamento pendente do seu último atendimento na Barbearia. Agradecemos a compreensão!`;
    const whatsappUrl = `https://wa.me/55${normalizedPhone}?text=${encodeURIComponent(message)}`;
    
    // Registrar o contato no banco se estiver usando Supabase
    if (supabaseClient && appointmentId) {
        try {
            // Buscar tentativas atuais antes de incrementar
            const { data: inadimplente } = await supabaseClient
                .from('inadimplentes')
                .select('tentativas_contato')
                .eq('agendamento_id', appointmentId)
                .single();
            
            await supabaseClient
                .from('inadimplentes')
                .update({ 
                    tentativas_contato: (inadimplente?.tentativas_contato || 0) + 1,
                    ultimo_contato: new Date().toISOString()
                })
                .eq('agendamento_id', appointmentId);
        } catch (error) {
            console.error('Erro ao registrar contato:', error);
        }
    }
    
    window.open(whatsappUrl, '_blank');
}

// ==================== ATUALIZAÇÃO DOS MODAIS COM FORMA DE PAGAMENTO ====================

// ==================== FUNÇÃO PARA VERIFICAR CONFLITOS DE HORÁRIO ====================

// Função simplificada removida - usar checkTimeConflictSupabase

// ==================== MODAL ADICIONAR INADIMPLENTE ====================

// Função para abrir modal de adicionar inadimplente
function openAddUnpaidModal() {
    console.log('Abrindo modal de inadimplente...');
    const modal = document.getElementById('addUnpaidModal');
    
    if (!modal) {
        console.error('Modal addUnpaidModal não encontrado!');
        alert('Erro: Modal não encontrado');
        return;
    }
    
    modal.style.display = 'block';
    console.log('Modal exibido');
    
    // Definir data padrão como hoje
    const today = new Date().toISOString().split('T')[0];
    const dataField = document.getElementById('addUnpaidData');
    
    if (dataField) {
        dataField.value = today;
    }
    
    // Limpar formulário
    const form = document.getElementById('addUnpaidForm');
    if (form) {
        form.reset();
        if (dataField) {
            dataField.value = today;
        }
    }
    
    console.log('Modal de inadimplente configurado com sucesso');
}

// Função para fechar modal de adicionar inadimplente
function closeAddUnpaidModal() {
    const modal = document.getElementById('addUnpaidModal');
    modal.style.display = 'none';
    
    // Limpar formulário
    document.getElementById('addUnpaidForm').reset();
}

// Função para atualizar preço do serviço no modal de inadimplente
function updateUnpaidServicePrice() {
    const servicoSelect = document.getElementById('addUnpaidServico');
    const precoInput = document.getElementById('addUnpaidValor');
    
    // Limpar o campo de preço para que o barbeiro defina o valor
    if (servicoSelect.value) {
        precoInput.value = '';
        precoInput.focus();
    }
}

// Função para alternar tipo de inadimplência
function toggleUnpaidType() {
    const appointmentRadio = document.querySelector('input[name="unpaidType"][value="appointment"]');
    const appointmentSelection = document.getElementById('appointmentSelection');
    const clientFields = document.querySelectorAll('#addUnpaidNome, #addUnpaidTelefone, #addUnpaidServico, #addUnpaidData, #addUnpaidValor');
    
    if (appointmentRadio.checked) {
        appointmentSelection.style.display = 'block';
        loadPendingAppointments();
        // Desabilitar campos que serão preenchidos automaticamente
        clientFields.forEach(field => field.disabled = true);
    } else {
        appointmentSelection.style.display = 'none';
        // Habilitar campos para preenchimento manual
        clientFields.forEach(field => field.disabled = false);
        clearUnpaidForm();
    }
}

// Função para carregar agendamentos para correlacionar com inadimplentes
async function loadPendingAppointments() {
    if (!isSupabaseConfigured) {
        console.warn('⚠️ Supabase não configurado');
        return;
    }
    
    try {
        const { data: appointments, error } = await supabaseClient
            .from('agendamentos')
            .select(`
                id,
                data_horario,
                horario_inicio,
                horario_fim,
                preco_cobrado,
                status,
                clientes!inner(nome, telefone),
                servicos!inner(nome, preco_base)
            `)
            .order('data_horario', { ascending: false })
            .order('horario_inicio', { ascending: true });
            
        if (error) throw error;
        
        const select = document.getElementById('addUnpaidAppointment');
        select.innerHTML = '<option value="">Selecione um agendamento</option>';
        
        appointments.forEach(appointment => {
            const option = document.createElement('option');
            option.value = appointment.id;
            const dataFormatada = formatDate(appointment.data_horario.split('T')[0]);
            const statusText = appointment.status ? ` (${appointment.status})` : '';
            option.textContent = `${appointment.clientes.nome} - ${appointment.servicos.nome} - ${dataFormatada} ${appointment.horario_inicio}-${appointment.horario_fim}${statusText}`;
            option.dataset.appointment = JSON.stringify(appointment);
            select.appendChild(option);
        });
        
    } catch (error) {
        console.error('❌ Erro ao carregar agendamentos:', error);
        showNotification('Erro ao carregar agendamentos', 'error');
    }
}

// Função para verificar e atualizar status de agendamentos vencidos
async function checkAndUpdateExpiredAppointments() {
    if (!isSupabaseConfigured) {
        console.warn('⚠️ Supabase não configurado');
        return;
    }
    
    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().slice(0, 5); // HH:MM

        console.log('🕐 Verificando agendamentos que passaram do horário...', { today, currentTime });

        // Buscar agendamentos que já passaram do horário
        const { data: expiredAppointments, error } = await supabaseClient
            .from('agendamentos')
            .select('id, data_horario, horario_inicio, horario_fim')
            .in('status', ['agendado', 'confirmado'])
            .lt('data_horario', now.toISOString());

        if (error) {
            console.error('❌ Erro ao buscar agendamentos:', error);
            return;
        }

        if (!expiredAppointments || expiredAppointments.length === 0) {
            console.log('✅ Nenhum agendamento vencido encontrado');
            return;
        }

        const appointmentsToUpdate = [];

        expiredAppointments.forEach(appointment => {
            const appointmentDateTime = new Date(appointment.data_horario);
            const appointmentEndTime = appointment.horario_fim;
            
            // Criar data/hora de fim do agendamento
            const [hours, minutes] = appointmentEndTime.split(':');
            const appointmentEndDateTime = new Date(appointmentDateTime);
            appointmentEndDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);

            // Se já passou do horário de fim, marcar para atualização
            if (now > appointmentEndDateTime) {
                appointmentsToUpdate.push(appointment.id);
            }
        });

        if (appointmentsToUpdate.length > 0) {
            console.log(`📅 Atualizando ${appointmentsToUpdate.length} agendamentos para 'não compareceu':`, appointmentsToUpdate);

            const { error: updateError } = await supabaseClient
                .from('agendamentos')
                .update({ status: 'nao_compareceu' })
                .in('id', appointmentsToUpdate);

            if (updateError) {
                console.error('❌ Erro ao atualizar status dos agendamentos:', updateError);
            } else {
                console.log('✅ Status dos agendamentos atualizado com sucesso!');
                // Recarregar a lista de agendamentos se estiver na página relevante
                if (typeof loadAppointments === 'function') {
                    loadAppointments();
                }
                if (typeof loadTodayAppointments === 'function') {
                    loadTodayAppointments();
                }
            }
        }
    } catch (error) {
        console.error('❌ Erro na verificação automática de agendamentos:', error);
    }
}

// Inicializar verificação automática de agendamentos vencidos
function initializeAppointmentStatusChecker() {
    // Verificar imediatamente
    checkAndUpdateExpiredAppointments();
    
    // Verificar a cada 5 minutos (300000 ms)
    setInterval(checkAndUpdateExpiredAppointments, 300000);
    
    console.log('🔄 Sistema de verificação automática de agendamentos iniciado');
}

// Função para preencher formulário com dados do agendamento
function fillFromAppointment() {
    const select = document.getElementById('addUnpaidAppointment');
    const selectedOption = select.options[select.selectedIndex];
    
    if (selectedOption.value && selectedOption.dataset.appointment) {
        const appointment = JSON.parse(selectedOption.dataset.appointment);
        
        document.getElementById('addUnpaidNome').value = appointment.clientes.nome;
        document.getElementById('addUnpaidTelefone').value = appointment.clientes.telefone;
        document.getElementById('addUnpaidServico').value = appointment.servicos.nome;
        document.getElementById('addUnpaidData').value = appointment.data_horario.split('T')[0];
        document.getElementById('addUnpaidValor').value = appointment.preco_cobrado || appointment.servicos.preco_base;
    }
}

// Função para limpar formulário de inadimplentes
function clearUnpaidForm() {
    document.getElementById('addUnpaidNome').value = '';
    document.getElementById('addUnpaidTelefone').value = '';
    document.getElementById('addUnpaidServico').value = '';
    document.getElementById('addUnpaidData').value = '';
    document.getElementById('addUnpaidValor').value = '';
    document.getElementById('addUnpaidObservacoes').value = '';
}

// Função para adicionar cliente inadimplente
async function addUnpaidClient(event) {
    console.log('🔄 Iniciando addUnpaidClient...');
    event.preventDefault();
    
    // Verificar tipo de inadimplência
    const unpaidType = document.querySelector('input[name="unpaidType"]:checked').value;
    const isAppointmentBased = unpaidType === 'appointment';
    
    let appointmentId = null;
    let clienteNome, clienteTelefone, servico, dataServico, valorDevido;
    const observacoes = document.getElementById('addUnpaidObservacoes').value.trim();
    
    if (isAppointmentBased) {
        // Inadimplência baseada em agendamento
        appointmentId = document.getElementById('addUnpaidAppointment').value;
        if (!appointmentId) {
            showNotification('Por favor, selecione um agendamento.', 'warning');
            return;
        }
        
        // Obter dados do agendamento selecionado
        const select = document.getElementById('addUnpaidAppointment');
        const selectedOption = select.options[select.selectedIndex];
        const appointment = JSON.parse(selectedOption.dataset.appointment);
        
        clienteNome = appointment.clientes.nome;
        clienteTelefone = appointment.clientes.telefone;
        servico = appointment.servicos.nome;
        dataServico = appointment.data_horario.split('T')[0];
        valorDevido = parseFloat(appointment.preco_cobrado || appointment.servicos.preco_base) || 0;
    } else {
        // Inadimplência independente
        clienteNome = document.getElementById('addUnpaidNome').value.trim();
        clienteTelefone = document.getElementById('addUnpaidTelefone').value.trim();
        servico = document.getElementById('addUnpaidServico').value;
        dataServico = document.getElementById('addUnpaidData').value;
        valorDevido = parseFloat(document.getElementById('addUnpaidValor').value) || 0;
    }
    
    console.log('📝 Dados coletados:', {
        clienteNome,
        clienteTelefone,
        servico,
        dataServico,
        valorDevido,
        observacoes
    });
    
    // Validações
    if (!clienteNome || !clienteTelefone || !servico || !dataServico || valorDevido <= 0) {
        console.log('❌ Validação falhou');
        showNotification('Por favor, preencha todos os campos obrigatórios.', 'warning');
        return;
    }
    
    if (!supabaseClient) {
        console.log('❌ Supabase não configurado');
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    console.log('✅ Validações passaram, prosseguindo...');
    
    try {
        showLoading();
        
        // Primeiro, verificar se o cliente já existe ou criar um novo
        let clienteId;
        const telefoneNormalizado = normalizePhone(clienteTelefone);
        
        // Buscar cliente existente
        const { data: clienteExistente } = await supabaseClient
            .from('clientes')
            .select('id')
            .eq('telefone', telefoneNormalizado)
            .single();
        
        if (clienteExistente) {
            clienteId = parseInt(clienteExistente.id);
            console.log('✅ Cliente existente encontrado, ID:', clienteId);
        } else {
            // Criar novo cliente
            console.log('🆕 Criando novo cliente...');
            const { data: novoCliente, error: clienteError } = await supabaseClient
                .from('clientes')
                .insert([{
                    nome: clienteNome,
                    telefone: telefoneNormalizado,
                    status_cliente: 'ativo'
                }])
                .select('id')
                .single();
            
            if (clienteError) {
                console.error('❌ Erro ao criar cliente:', clienteError);
                throw clienteError;
            }
            clienteId = parseInt(novoCliente.id);
            console.log('✅ Novo cliente criado, ID:', clienteId);
        }
        
        let agendamentoId;
        
        if (isAppointmentBased) {
            // Inadimplência baseada em agendamento existente
            agendamentoId = parseInt(appointmentId);
            
            // Atualizar status do agendamento para 'concluido' (serviço realizado mas não pago)
            const { error: updateError } = await supabaseClient
                .from('agendamentos')
                .update({ status: 'concluido' })
                .eq('id', agendamentoId);
                
            if (updateError) {
                console.error('❌ Erro ao atualizar agendamento:', updateError);
                throw updateError;
            }
            console.log('✅ Status do agendamento atualizado para concluído');
            
        } else {
            // Inadimplência independente - criar novo agendamento
            
            // Buscar o serviço para obter o ID
            console.log('🔍 Buscando serviço:', servico);
            const { data: servicoData, error: servicoError } = await supabaseClient
                .from('servicos')
                .select('id')
                .eq('nome', servico)
                .single();
            
            if (servicoError) {
                console.error('❌ Erro ao buscar serviço:', servicoError);
                throw servicoError;
            }
            console.log('✅ Serviço encontrado, ID:', servicoData.id);
            
            // Criar agendamento concluído
            const dataHorario = new Date(`${dataServico}T12:00:00`);
            
            const agendamento = {
                cliente_id: parseInt(clienteId),
                servico_id: parseInt(servicoData.id),
                data_horario: dataHorario.toISOString(),
                horario_inicio: '12:00',
                horario_fim: '13:00',
                preco_cobrado: parseFloat(valorDevido),
                status: 'concluido',
                observacoes: observacoes || 'Inadimplente adicionado manualmente'
            };
            
            console.log('📝 Dados do agendamento:', agendamento);
            
            const { data: agendamentoData, error: agendamentoError } = await supabaseClient
                .from('agendamentos')
                .insert([agendamento])
                .select()
                .single();
            
            if (agendamentoError) {
                console.error('❌ Erro ao criar agendamento:', agendamentoError);
                throw agendamentoError;
            }
            console.log('✅ Agendamento criado, ID:', agendamentoData.id);
            agendamentoId = agendamentoData.id;
        }
        
        // Adicionar na tabela de inadimplentes
        const inadimplente = {
            agendamento_id: parseInt(agendamentoId),
            cliente_id: parseInt(clienteId),
            telefone: telefoneNormalizado,
            valor_devido: parseFloat(valorDevido),
            data_vencimento: dataServico,
            observacoes_cobranca: observacoes || null
        };
        
        console.log('📝 Dados do inadimplente:', inadimplente);
        
        const { error: inadimplenteError } = await supabaseClient
            .from('inadimplentes')
            .insert([inadimplente]);
        
        if (inadimplenteError) {
            console.error('❌ Erro ao criar inadimplente:', inadimplenteError);
            throw inadimplenteError;
        }
        console.log('✅ Inadimplente criado com sucesso!');
        
        showNotification('Cliente inadimplente adicionado com sucesso!', 'success');
        closeAddUnpaidModal();
        loadUnpaidClients(); // Recarregar lista
        
    } catch (error) {
        console.error('Erro ao adicionar inadimplente:', error);
        showNotification('Erro ao adicionar inadimplente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// ==================== GERENCIAMENTO DE CLIENTES ====================

// Função para carregar clientes
async function loadClients() {
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        const searchTerm = document.getElementById('clientSearch')?.value?.trim() || '';
        
        let query = supabaseClient
            .from('clientes')
            .select('*')
            .order('criado_em', { ascending: false });
        
        // Aplicar filtro de busca se houver
        if (searchTerm) {
            query = query.or(`nome.ilike.%${searchTerm}%,telefone.ilike.%${searchTerm}%`);
        }
        
        const { data: clients, error } = await query;
        
        if (error) throw error;
        
        // Buscar estatísticas de agendamentos para cada cliente
        const clientsWithStats = await Promise.all((clients || []).map(async (client) => {
            const { data: agendamentos } = await supabaseClient
                .from('agendamentos')
                .select('data_horario')
                .eq('cliente_id', client.id)
                .order('data_horario', { ascending: false });
            
            return {
                ...client,
                totalAgendamentos: agendamentos?.length || 0,
                ultimoAgendamento: agendamentos?.[0]?.data_horario || null
            };
        }));
        
        renderClientsTable(clientsWithStats);
        
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        showNotification('Erro ao carregar clientes: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para busca em tempo real
function setupClientSearch() {
    const searchInput = document.getElementById('clientSearch');
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', function() {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                loadClients();
            }, 500); // Aguarda 500ms após parar de digitar
        });
    }
}

// Função para renderizar tabela de clientes
function renderClientsTable(clients) {
    const tableBody = document.querySelector('#clientsTableBody');
    
    if (!tableBody) {
        console.error('Tabela de clientes não encontrada');
        return;
    }
    
    tableBody.innerHTML = '';
    
    if (!clients || clients.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 20px; color: rgba(255,255,255,0.5);">
                    Nenhum cliente encontrado
                </td>
            </tr>
        `;
        return;
    }
    
    clients.forEach(client => {
        const totalAgendamentos = client.totalAgendamentos || 0;
        const ultimoAgendamentoFormatado = client.ultimoAgendamento ? 
            formatDate(client.ultimoAgendamento) : 'Nunca';
        
        const statusClass = client.status_cliente === 'ativo' ? 'status-active' : 
                           client.status_cliente === 'inativo' ? 'status-inactive' : 'status-blocked';
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${client.nome}</td>
            <td>${client.telefone}</td>
            <td><span class="status-badge ${statusClass}">${client.status_cliente || 'ativo'}</span></td>
            <td>${totalAgendamentos}</td>
            <td>${ultimoAgendamentoFormatado}</td>
            <td>${formatDate(client.criado_em)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-edit" onclick="openEditClientModal(${client.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-delete" onclick="deleteClient(${client.id}, '${client.nome}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>
                    <button class="btn-contact" onclick="contactClientDirect('${client.telefone}', '${client.nome}')" title="Contatar">
                        <i class="fab fa-whatsapp"></i>
                    </button>
                </div>
            </td>
        `;
        
        tableBody.appendChild(row);
    });
}

// Função para abrir modal de adicionar cliente
function openAddClientModal() {
    const modal = document.getElementById('addClientModal');
    modal.style.display = 'block';
    
    // Limpar formulário
    document.getElementById('addClientForm').reset();
    document.getElementById('addClientStatus').value = 'ativo';
}

// Função para fechar modal de adicionar cliente
function closeAddClientModal() {
    const modal = document.getElementById('addClientModal');
    modal.style.display = 'none';
    
    // Limpar formulário
    document.getElementById('addClientForm').reset();
}

// Função para adicionar cliente
async function addClient(event) {
    event.preventDefault();
    
    const nome = document.getElementById('addClientNome').value.trim();
    const telefone = document.getElementById('addClientTelefone').value.trim();
    const email = document.getElementById('addClientEmail').value.trim();
    const dataNascimento = document.getElementById('addClientDataNascimento').value;
    const status = document.getElementById('addClientStatus').value;
    const observacoes = document.getElementById('addClientObservacoes').value.trim();
    
    // Validações
    if (!nome || !telefone) {
        showNotification('Nome e telefone são obrigatórios.', 'warning');
        return;
    }
    
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        const telefoneNormalizado = normalizePhone(telefone);
        
        // Verificar se já existe cliente com este telefone
        const { data: existingClient } = await supabaseClient
            .from('clientes')
            .select('id')
            .eq('telefone', telefoneNormalizado)
            .single();
        
        if (existingClient) {
            showNotification('Já existe um cliente cadastrado com este telefone.', 'warning');
            return;
        }
        
        // Criar novo cliente
        const clienteData = {
            nome: nome,
            telefone: telefoneNormalizado,
            email: email || null,
            data_nascimento: dataNascimento || null,
            status_cliente: status,
            observacoes: observacoes || null
        };
        
        const { error } = await supabaseClient
            .from('clientes')
            .insert([clienteData]);
        
        if (error) throw error;
        
        showNotification('Cliente adicionado com sucesso!', 'success');
        closeAddClientModal();
        loadClients(); // Recarregar lista
        
    } catch (error) {
        console.error('Erro ao adicionar cliente:', error);
        showNotification('Erro ao adicionar cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para abrir modal de editar cliente
async function openEditClientModal(clientId) {
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        const { data: client, error } = await supabaseClient
            .from('clientes')
            .select('*')
            .eq('id', clientId)
            .single();
        
        if (error) throw error;
        
        // Preencher formulário
        document.getElementById('editClientId').value = client.id;
        document.getElementById('editClientNome').value = client.nome;
        document.getElementById('editClientTelefone').value = client.telefone;
        document.getElementById('editClientEmail').value = client.email || '';
        document.getElementById('editClientDataNascimento').value = client.data_nascimento || '';
        document.getElementById('editClientStatus').value = client.status_cliente;
        document.getElementById('editClientObservacoes').value = client.observacoes || '';
        
        // Abrir modal
        const modal = document.getElementById('editClientModal');
        modal.style.display = 'block';
        
    } catch (error) {
        console.error('Erro ao carregar dados do cliente:', error);
        showNotification('Erro ao carregar dados do cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para fechar modal de editar cliente
function closeEditClientModal() {
    const modal = document.getElementById('editClientModal');
    modal.style.display = 'none';
    
    // Limpar formulário
    document.getElementById('editClientForm').reset();
}

// Função para atualizar cliente
async function updateClient(event) {
    event.preventDefault();
    
    const clientId = document.getElementById('editClientId').value;
    const nome = document.getElementById('editClientNome').value.trim();
    const telefone = document.getElementById('editClientTelefone').value.trim();
    const email = document.getElementById('editClientEmail').value.trim();
    const dataNascimento = document.getElementById('editClientDataNascimento').value;
    const status = document.getElementById('editClientStatus').value;
    const observacoes = document.getElementById('editClientObservacoes').value.trim();
    
    // Validações
    if (!nome || !telefone) {
        showNotification('Nome e telefone são obrigatórios.', 'warning');
        return;
    }
    
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        const telefoneNormalizado = normalizePhone(telefone);
        
        // Verificar se já existe outro cliente com este telefone
        const { data: existingClient } = await supabaseClient
            .from('clientes')
            .select('id')
            .eq('telefone', telefoneNormalizado)
            .neq('id', clientId)
            .single();
        
        if (existingClient) {
            showNotification('Já existe outro cliente cadastrado com este telefone.', 'warning');
            return;
        }
        
        // Atualizar cliente
        const clienteData = {
            nome: nome,
            telefone: telefoneNormalizado,
            email: email || null,
            data_nascimento: dataNascimento || null,
            status_cliente: status,
            observacoes: observacoes || null
        };
        
        const { error } = await supabaseClient
            .from('clientes')
            .update(clienteData)
            .eq('id', clientId);
        
        if (error) throw error;
        
        showNotification('Cliente atualizado com sucesso!', 'success');
        closeEditClientModal();
        loadClients(); // Recarregar lista
        
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        showNotification('Erro ao atualizar cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para excluir cliente
async function deleteClient(clientId, clientName) {
    if (!confirm(`Tem certeza que deseja excluir o cliente "${clientName}"?\n\nEsta ação não pode ser desfeita.`)) {
        return;
    }
    
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        // Verificar se o cliente tem agendamentos
        const { data: appointments, error: appointmentsError } = await supabaseClient
            .from('agendamentos')
            .select('id')
            .eq('cliente_id', clientId)
            .limit(1);
        
        if (appointmentsError) throw appointmentsError;
        
        if (appointments && appointments.length > 0) {
            showNotification('Não é possível excluir este cliente pois ele possui agendamentos.', 'warning');
            return;
        }
        
        // Excluir cliente
        const { error } = await supabaseClient
            .from('clientes')
            .delete()
            .eq('id', clientId);
        
        if (error) throw error;
        
        showNotification('Cliente excluído com sucesso!', 'success');
        loadClients(); // Recarregar lista
        
    } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        showNotification('Erro ao excluir cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para contatar cliente diretamente
function contactClientDirect(phone, name) {
    const normalizedPhone = normalizePhone(phone);
    const message = `Olá ${name}! Como está? Aqui é da Barbearia do Jão. Esperamos vê-lo em breve!`;
    const whatsappUrl = `https://wa.me/55${normalizedPhone}?text=${encodeURIComponent(message)}`;
    
    window.open(whatsappUrl, '_blank');
}

// ==================== MODAL RÁPIDO DE CLIENTE ====================

let currentQuickClientContext = null; // 'add', 'edit', 'unpaid'

// Função para abrir modal rápido de cliente
function openQuickClientModal(context) {
    currentQuickClientContext = context;
    const modal = document.getElementById('quickClientModal');
    modal.style.display = 'block';
    
    // Limpar formulário
    document.getElementById('quickClientForm').reset();
    
    // Focar no campo nome
    setTimeout(() => {
        document.getElementById('quickClientNome').focus();
    }, 100);
}

// Função para fechar modal rápido de cliente
function closeQuickClientModal() {
    const modal = document.getElementById('quickClientModal');
    modal.style.display = 'none';
    currentQuickClientContext = null;
    
    // Limpar formulário
    document.getElementById('quickClientForm').reset();
}

// Função para adicionar cliente rápido
async function addQuickClient(event) {
    event.preventDefault();
    
    const nome = document.getElementById('quickClientNome').value.trim();
    const telefone = document.getElementById('quickClientTelefone').value.trim();
    const email = document.getElementById('quickClientEmail').value.trim();
    
    // Validações
    if (!nome || !telefone) {
        showNotification('Nome e telefone são obrigatórios.', 'warning');
        return;
    }
    
    if (!supabaseClient) {
        showNotification('Funcionalidade disponível apenas com Supabase configurado', 'warning');
        return;
    }
    
    try {
        showLoading();
        
        const telefoneNormalizado = normalizePhone(telefone);
        
        // Verificar se já existe cliente com este telefone
        const { data: existingClient } = await supabaseClient
            .from('clientes')
            .select('*')
            .eq('telefone', telefoneNormalizado)
            .single();
        
        if (existingClient) {
            // Cliente já existe, usar o existente
            fillClientFields(existingClient);
            showNotification('Cliente já cadastrado! Dados preenchidos automaticamente.', 'info');
        } else {
            // Criar novo cliente
            const clienteData = {
                nome: nome,
                telefone: telefoneNormalizado,
                email: email || null,
                status_cliente: 'ativo'
            };
            
            const { data: newClient, error } = await supabaseClient
                .from('clientes')
                .insert([clienteData])
                .select()
                .single();
            
            if (error) throw error;
            
            // Preencher campos com o novo cliente
            fillClientFields(newClient);
            showNotification('Cliente cadastrado e selecionado com sucesso!', 'success');
            
            // Atualizar lista de clientes em memória
            if (allClients) {
                allClients.push(newClient);
            }
        }
        
        closeQuickClientModal();
        
    } catch (error) {
        console.error('Erro ao processar cliente:', error);
        showNotification('Erro ao processar cliente: ' + error.message, 'error');
    } finally {
        hideLoading();
    }
}

// Função para preencher campos do cliente baseado no contexto
function fillClientFields(client) {
    let nomeField, telefoneField;
    
    switch (currentQuickClientContext) {
        case 'add':
            nomeField = document.getElementById('addNome');
            telefoneField = document.getElementById('addTelefone');
            break;
        case 'edit':
            nomeField = document.getElementById('editNome');
            telefoneField = document.getElementById('editTelefone');
            // Definir cliente selecionado para o autocomplete
            selectedClientId = client.id;
            break;
        case 'unpaid':
            nomeField = document.getElementById('addUnpaidNome');
            telefoneField = document.getElementById('addUnpaidTelefone');
            break;
    }
    
    if (nomeField && telefoneField) {
        nomeField.value = client.nome;
        telefoneField.value = client.telefone;
    }
}

// ==================== AUTOCOMPLETE MELHORADO ====================

// Função para configurar autocomplete em todos os campos de cliente
function setupAllClientAutocomplete() {
    setupClientAutocompleteForField('addNome', 'addTelefone', 'addClientSuggestions');
    setupClientAutocompleteForField('editNome', 'editTelefone', 'clientSuggestions');
    setupClientAutocompleteForField('addUnpaidNome', 'addUnpaidTelefone', 'addUnpaidClientSuggestions');
}

// Função genérica para configurar autocomplete
function setupClientAutocompleteForField(inputId, phoneId, suggestionsId) {
    const clientInput = document.getElementById(inputId);
    const phoneInput = document.getElementById(phoneId);
    const suggestionsContainer = document.getElementById(suggestionsId);
    
    if (!clientInput || !suggestionsContainer) return;
    
    let selectedIndex = -1;
    let currentSelectedClientId = null;
    
    clientInput.addEventListener('input', function() {
        const query = this.value.trim().toLowerCase();
        currentSelectedClientId = null;
        
        if (query.length < 2) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        const filteredClients = allClients.filter(client => 
            client.nome.toLowerCase().includes(query) ||
            client.telefone.includes(query)
        );
        
        if (filteredClients.length === 0) {
            suggestionsContainer.style.display = 'none';
            return;
        }
        
        suggestionsContainer.innerHTML = '';
        filteredClients.forEach((client, index) => {
            const suggestion = document.createElement('div');
            suggestion.className = 'client-suggestion';
            suggestion.innerHTML = `
                <div class="client-suggestion-name">${client.nome}</div>
                <div class="client-suggestion-phone">${client.telefone}</div>
            `;
            
            suggestion.addEventListener('click', () => {
                selectClientForField(client, inputId, phoneId, suggestionsId);
            });
            
            suggestionsContainer.appendChild(suggestion);
        });
        
        suggestionsContainer.style.display = 'block';
        selectedIndex = -1;
    });
    
    // Navegação com teclado
    clientInput.addEventListener('keydown', function(e) {
        const suggestions = suggestionsContainer.querySelectorAll('.client-suggestion');
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
            updateSelectedSuggestion(suggestions);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = Math.max(selectedIndex - 1, -1);
            updateSelectedSuggestion(suggestions);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (selectedIndex >= 0 && suggestions[selectedIndex]) {
                const clientName = suggestions[selectedIndex].querySelector('.client-suggestion-name').textContent;
                const clientPhone = suggestions[selectedIndex].querySelector('.client-suggestion-phone').textContent;
                const client = allClients.find(c => c.nome === clientName && c.telefone === clientPhone);
                if (client) {
                    selectClientForField(client, inputId, phoneId, suggestionsId);
                }
            }
        } else if (e.key === 'Escape') {
            suggestionsContainer.style.display = 'none';
            selectedIndex = -1;
        }
    });
    
    // Fechar sugestões ao clicar fora
    document.addEventListener('click', function(e) {
        if (!clientInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.style.display = 'none';
            selectedIndex = -1;
        }
    });
    
    function updateSelectedSuggestion(suggestions) {
        suggestions.forEach((suggestion, index) => {
            suggestion.classList.toggle('selected', index === selectedIndex);
        });
    }
}

// Função para selecionar cliente em um campo específico
function selectClientForField(client, inputId, phoneId, suggestionsId) {
    const clientInput = document.getElementById(inputId);
    const phoneInput = document.getElementById(phoneId);
    const suggestionsContainer = document.getElementById(suggestionsId);
    
    clientInput.value = client.nome;
    if (phoneInput) {
        phoneInput.value = client.telefone;
    }
    
    suggestionsContainer.style.display = 'none';
    
    // Definir cliente selecionado para contextos específicos
    if (inputId === 'editNome') {
        selectedClientId = client.id;
    }
}

// Tornar funções disponíveis globalmente
window.loadUnpaidClients = loadUnpaidClients;
window.markAsPaid = markAsPaid;
window.contactClient = contactClient;
window.openAddUnpaidModal = openAddUnpaidModal;
window.closeAddUnpaidModal = closeAddUnpaidModal;
window.updateUnpaidServicePrice = updateUnpaidServicePrice;
window.addUnpaidClient = addUnpaidClient;

// Funções de gerenciamento de clientes
window.loadClients = loadClients;
window.openAddClientModal = openAddClientModal;
window.closeAddClientModal = closeAddClientModal;
window.addClient = addClient;
window.openEditClientModal = openEditClientModal;
window.closeEditClientModal = closeEditClientModal;
window.updateClient = updateClient;
window.deleteClient = deleteClient;
window.contactClientDirect = contactClientDirect;

// Funções do modal rápido
window.openQuickClientModal = openQuickClientModal;
window.closeQuickClientModal = closeQuickClientModal;
window.addQuickClient = addQuickClient;

// ==================== MODAL DE BUSCA DE CLIENTES ====================

let currentClientSearchContext = null; // 'add', 'edit', 'unpaid'

// Função para abrir modal de busca de clientes
function openClientSearchModal(context) {
    currentClientSearchContext = context;
    const modal = document.getElementById('clientSearchModal');
    modal.style.display = 'block';
    
    // Limpar busca
    document.getElementById('clientSearchInput').value = '';
    document.getElementById('clientSearchResults').innerHTML = '<div class="search-loading">Digite pelo menos 2 caracteres para buscar...</div>';
    
    // Focar no campo de busca
    setTimeout(() => {
        document.getElementById('clientSearchInput').focus();
    }, 100);
}

// Função para fechar modal de busca de clientes
function closeClientSearchModal() {
    const modal = document.getElementById('clientSearchModal');
    modal.style.display = 'none';
    currentClientSearchContext = null;
    
    // Limpar busca
    document.getElementById('clientSearchInput').value = '';
    document.getElementById('clientSearchResults').innerHTML = '<div class="search-loading">Digite pelo menos 2 caracteres para buscar...</div>';
}

// Função para buscar clientes existentes
async function searchExistingClients() {
    const searchInput = document.getElementById('clientSearchInput');
    const resultsContainer = document.getElementById('clientSearchResults');
    const query = searchInput.value.trim().toLowerCase();
    
    if (query.length < 2) {
        resultsContainer.innerHTML = '<div class="search-loading">Digite pelo menos 2 caracteres para buscar...</div>';
        return;
    }
    
    if (!supabaseClient) {
        resultsContainer.innerHTML = '<div class="search-loading">Funcionalidade disponível apenas com Supabase configurado</div>';
        return;
    }
    
    try {
        resultsContainer.innerHTML = '<div class="search-loading">Buscando clientes...</div>';
        
        // Buscar clientes que correspondem ao termo
        const { data: clients, error } = await supabaseClient
            .from('clientes')
            .select('*')
            .or(`nome.ilike.%${query}%,telefone.ilike.%${query}%`)
            .order('nome');
        
        if (error) throw error;
        
        if (!clients || clients.length === 0) {
            resultsContainer.innerHTML = '<div class="search-loading">Nenhum cliente encontrado</div>';
            return;
        }
        
        // Exibir resultados
        resultsContainer.innerHTML = '';
        clients.forEach(client => {
            const clientItem = document.createElement('div');
            clientItem.className = 'client-result-item';
            clientItem.innerHTML = `
                <div class="client-result-name">${client.nome}</div>
                <div class="client-result-phone">${client.telefone}</div>
                ${client.email ? `<div class="client-result-email">${client.email}</div>` : ''}
            `;
            
            clientItem.addEventListener('click', () => {
                selectClientFromSearch(client);
            });
            
            resultsContainer.appendChild(clientItem);
        });
        
    } catch (error) {
        console.error('Erro ao buscar clientes:', error);
        resultsContainer.innerHTML = '<div class="search-loading">Erro ao buscar clientes</div>';
    }
}

// Função para selecionar cliente da busca
function selectClientFromSearch(client) {
    let nomeField, telefoneField;
    
    switch (currentClientSearchContext) {
        case 'add':
            nomeField = document.getElementById('addNome');
            telefoneField = document.getElementById('addTelefone');
            break;
        case 'edit':
            nomeField = document.getElementById('editNome');
            telefoneField = document.getElementById('editTelefone');
            // Definir cliente selecionado para o autocomplete
            selectedClientId = client.id;
            break;
        case 'unpaid':
            nomeField = document.getElementById('addUnpaidNome');
            telefoneField = document.getElementById('addUnpaidTelefone');
            break;
    }
    
    if (nomeField && telefoneField) {
        nomeField.value = client.nome;
        telefoneField.value = client.telefone;
    }
    
    closeClientSearchModal();
    showNotification(`Cliente ${client.nome} selecionado!`, 'success');
}

// Funções do modal de busca
window.openClientSearchModal = openClientSearchModal;
window.closeClientSearchModal = closeClientSearchModal;
window.searchExistingClients = searchExistingClients;
