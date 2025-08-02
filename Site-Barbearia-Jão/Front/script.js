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
        console.warn('⚠️ Usando modo exemplo devido ao erro do Supabase');
        isSupabaseConfigured = false;
        supabaseClient = null;
    }
} else {
    console.warn('⚠️ Supabase não configurado. Usando dados de exemplo.');
    console.log('📝 Para configurar o Supabase, edite o arquivo config.js');
    isSupabaseConfigured = false;
}

// Estado da aplicação
// Função utilitária para calcular horário de fim
function calculateEndTime(startTime, durationMinutes = 30) {
    const [hours, minutes] = startTime.split(':').map(Number);
    const endTime = new Date();
    endTime.setHours(hours, minutes + durationMinutes, 0, 0);
    const endHours = endTime.getHours().toString().padStart(2, '0');
    const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
    return `${endHours}:${endMinutes}`;
}

// Função para normalizar telefone - remove todos os caracteres não numéricos
function normalizePhone(phone) {
    if (!phone) return '';
    
    // Remove todos os caracteres não numéricos
    let normalized = phone.replace(/\D/g, '');
    
    console.log('Normalizando telefone:', phone, '->', normalized);
    
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
    
    console.log('Telefone normalizado final:', normalized);
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

let currentUser = null;
let currentSection = 'overview';
let appointments = [];
let todayAppointments = [];

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
    setupClientAutocomplete();
    
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
    document.getElementById('generateReport').addEventListener('click', () => generateReport());
    
    // Modal
    document.querySelector('.close').addEventListener('click', closeModal);
    document.querySelector('.btn-cancel').addEventListener('click', closeModal);
    document.querySelector('.btn-save').addEventListener('click', saveAppointment);
    
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
            break;
        case 'reports':
            loadReports();
            break;
    }
}

// Carregamento de dados
async function loadDashboardData() {
    showLoading();
    try {
        console.log('Iniciando carregamento dos dados do dashboard...');
        
        // Carregar dados sequencialmente para garantir que appointments seja carregado primeiro
        await loadAppointments();
        console.log('Agendamentos carregados:', appointments.length);
        
        // Aguardar um pouco para garantir que appointments foi populado
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await loadTodayAppointments();
        console.log('Agendamentos de hoje carregados:', todayAppointments.length);
        
        await loadOverviewData();
        console.log('Dados de overview carregados');
        
    } catch (error) {
        console.error('Erro ao carregar dados:', error);
        showError('Erro ao carregar dados do dashboard');
    } finally {
        hideLoading();
    }
}

async function loadAppointments() {
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        displayExampleAppointments();
        return;
    }
    
    try {
        const dateFilter = document.getElementById('dateFilter').value;
        const statusFilter = document.getElementById('statusFilter').value;
        
        let query = supabaseClient
            .from('agendamentos')
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
        
        appointments = data || [];
        renderAppointmentsTable();
        
    } catch (error) {
        console.error('Erro ao carregar agendamentos:', error);
        showError('Erro ao carregar agendamentos');
    }
}

// Função para exibir dados de exemplo quando Supabase não estiver configurado
function displayExampleAppointments() {
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    
    const exampleData = [
        // Agendamentos para hoje
        {
            id: 1,
            data_horario: `${today}T09:00:00`,
            horario_inicio: '09:00',
            horario_fim: '09:30',
            nome_cliente: 'João Silva',
            telefone: '11999999999',
            servico: 'Corte + Barba',
            preco: 35.00,
            status: 'agendado',
            observacoes: ''
        },
        {
            id: 2,
            data_horario: `${today}T10:30:00`,
            horario_inicio: '10:30',
            horario_fim: '11:00',
            nome_cliente: 'Pedro Santos',
            telefone: '11888888888',
            servico: 'Corte Masculino',
            preco: 25.00,
            status: 'confirmado',
            observacoes: ''
        },
        {
            id: 3,
            data_horario: `${today}T14:00:00`,
            horario_inicio: '14:00',
            horario_fim: '14:30',
            nome_cliente: 'Carlos Oliveira',
            telefone: '11777777777',
            servico: 'Apenas Barba',
            preco: 15.00,
            status: 'agendado',
            observacoes: 'Cliente preferencial'
        },
        {
            id: 4,
            data_horario: `${today}T16:30:00`,
            horario_inicio: '16:30',
            horario_fim: '17:00',
            nome_cliente: 'Felipe',
            telefone: '11666666666',
            servico: 'Corte Infantil',
            preco: 20.00,
            status: 'confirmado',
            observacoes: ''
        },
        // Agendamentos para amanhã
        {
            id: 5,
            data_horario: `${tomorrowStr}T09:30:00`,
            horario_inicio: '09:30',
            horario_fim: '10:00',
            nome_cliente: 'Roberto Lima',
            telefone: '11555555555',
            servico: 'Corte + Barba',
            preco: 35.00,
            status: 'agendado',
            observacoes: ''
        },
        {
            id: 6,
            data_horario: `${tomorrowStr}T15:00:00`,
            horario_inicio: '15:00',
            horario_fim: '15:30',
            nome_cliente: 'André Costa',
            telefone: '11444444444',
            servico: 'Sobrancelha',
            preco: 10.00,
            status: 'agendado',
            observacoes: ''
        }
    ];
    
    appointments = exampleData;
    console.log('Dados de exemplo carregados:', appointments.length, 'agendamentos');
    renderAppointmentsTable();
}

async function loadTodayAppointments() {
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
        console.log('Data selecionada para agendamentos de hoje:', selectedDate);
        console.log('Total de agendamentos disponíveis:', appointments.length);
        
        todayAppointments = appointments.filter(apt => {
            const aptDate = new Date(apt.data_horario).toISOString().split('T')[0];
            return aptDate === selectedDate;
        });
        
        console.log('Agendamentos filtrados para hoje:', todayAppointments.length);
        renderTodaySchedule();
        return;
    }
    
    try {
        const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
        const startDate = `${selectedDate}T00:00:00`;
        const endDate = `${selectedDate}T23:59:59`;
        
        const { data, error } = await supabaseClient
            .from('agendamentos')
            .select('*')
            .gte('data_horario', startDate)
            .lte('data_horario', endDate)
            .order('horario_inicio', { ascending: true });
        
        if (error) throw error;
        
        todayAppointments = data || [];
        renderTodaySchedule();
        
    } catch (error) {
        console.error('Erro ao carregar agendamentos de hoje:', error);
    }
}

async function loadOverviewData() {
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        displayExampleOverview();
        return;
    }
    
    try {
        // Usar a data selecionada ou hoje como padrão
        const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        
        console.log('Data selecionada para overview:', selectedDate);
        
        // Agendamentos da data selecionada
        const { data: selectedDateData } = await supabaseClient
            .from('agendamentos')
            .select('*')
            .gte('data_horario', `${selectedDate}T00:00:00`)
            .lte('data_horario', `${selectedDate}T23:59:59`);
        
        // Agendamentos do mês
        const { data: monthData } = await supabaseClient
            .from('agendamentos')
            .select('*')
            .gte('data_horario', `${startOfMonth}T00:00:00`);
        
        // Clientes únicos do mês
        const uniqueClients = new Set(monthData?.map(item => item.nome_cliente) || []);
        
        // Receita do mês (baseada nos preços dos agendamentos concluídos)
        const monthlyRevenue = monthData?.filter(apt => apt.status === 'concluido')
            .reduce((total, apt) => total + (parseFloat(apt.preco) || 0), 0) || 0;
        
        // Próximo cliente da data selecionada
        const nextAppointment = selectedDateData?.find(apt => {
            const now = new Date();
            const aptTime = new Date(apt.data_horario);
            return aptTime > now && (apt.status === 'agendado' || apt.status === 'confirmado');
        });
        const nextClient = nextAppointment ? nextAppointment.nome_cliente : 'Nenhum';
        
        // Receita da data selecionada
        const selectedDateRevenue = selectedDateData?.filter(apt => apt.status === 'concluido')
            .reduce((total, apt) => total + (parseFloat(apt.preco) || 0), 0) || 0;
        
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

// Função para exibir dados de exemplo no overview
function displayExampleOverview() {
    // Usar a data selecionada ou hoje como padrão
    const selectedDate = document.getElementById('currentDate').value || new Date().toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];
    
    console.log('Data selecionada para overview (exemplo):', selectedDate);
    
    // Filtrar agendamentos para a data selecionada
    const selectedDateAppointments = appointments.filter(apt => {
        const aptDate = apt.data_horario ? apt.data_horario.split('T')[0] : apt.data;
        return aptDate === selectedDate;
    });
    
    // Próximo cliente da data selecionada
    const nextAppointment = selectedDateAppointments.find(apt => {
        const now = new Date();
        const aptTime = new Date(apt.data_horario || `${apt.data}T${apt.horario_inicio}`);
        return aptTime > now && (apt.status === 'agendado' || apt.status === 'confirmado');
    });
    const nextClient = nextAppointment ? nextAppointment.nome_cliente : 'Nenhum';
    
    // Receita da data selecionada
    const selectedDateRevenue = selectedDateAppointments
        .filter(apt => apt.status === 'concluido')
        .reduce((total, apt) => total + (parseFloat(apt.preco) || 0), 0);
    
    // Taxa de ocupação
    const totalSlots = 20;
    const occupiedSlots = selectedDateAppointments.length;
    const occupancyRate = Math.round((occupiedSlots / totalSlots) * 100);
    
    // Atualizar elementos
    document.getElementById('todayAppointments').textContent = selectedDateAppointments.length;
    document.getElementById('nextClient').textContent = nextClient;
    document.getElementById('todayRevenue').textContent = `R$ ${selectedDateRevenue.toFixed(2)}`;
    document.getElementById('occupancyRate').textContent = `${occupancyRate}%`;
    
    // Atualizar agendamentos de hoje se a data selecionada for hoje
    if (selectedDate === today) {
        todayAppointments = selectedDateAppointments;
        renderTodaySchedule();
    }
}

async function loadScheduleGrid() {
    const selectedDate = document.getElementById('scheduleDate').value || new Date().toISOString().split('T')[0];
    
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        const exampleData = appointments.filter(apt => {
            const aptDate = new Date(apt.data_horario).toISOString().split('T')[0];
            return aptDate === selectedDate;
        });
        renderScheduleGrid(exampleData, selectedDate);
        return;
    }
    
    try {
        const startDate = `${selectedDate}T00:00:00`;
        const endDate = `${selectedDate}T23:59:59`;
        
        const { data, error } = await supabaseClient
            .from('agendamentos')
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

async function loadClients() {
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        displayExampleClients();
        return;
    }
    
    try {
        const { data, error } = await supabaseClient
            .from('agendamentos')
            .select('nome_cliente, telefone, data_horario, status')
            .order('data_horario', { ascending: false });
        
        if (error) throw error;
        
        // Agrupar por cliente
        const clientsMap = new Map();
        data?.forEach(appointment => {
            const key = appointment.telefone;
            if (!clientsMap.has(key)) {
                clientsMap.set(key, {
                    nome: appointment.nome_cliente,
                    telefone: appointment.telefone,
                    totalAgendamentos: 0,
                    ultimoAgendamento: new Date(appointment.data_horario).toISOString().split('T')[0]
                });
            }
            clientsMap.get(key).totalAgendamentos++;
        });
        
        const clients = Array.from(clientsMap.values());
        renderClientsGrid(clients);
        
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
    }
}

// Função para exibir clientes de exemplo
function displayExampleClients() {
    const exampleClients = [
        {
            nome: 'João Silva',
            telefone: '(11) 99999-9999',
            totalAgendamentos: 5,
            ultimoAgendamento: '2025-01-27'
        },
        {
            nome: 'Pedro Santos',
            telefone: '(11) 88888-8888',
            totalAgendamentos: 3,
            ultimoAgendamento: '2025-01-25'
        }
    ];
    
    renderClientsGrid(exampleClients);
}

async function loadReports() {
    if (!supabaseClient) {
        console.warn('Supabase não configurado - usando dados de exemplo');
        renderReports(appointments);
        return;
    }
    
    try {
        const startDate = document.getElementById('reportStartDate').value;
        const endDate = document.getElementById('reportEndDate').value;
        
        let query = supabaseClient
            .from('agendamentos')
            .select('*');
        
        if (startDate) {
            query = query.gte('data_horario', `${startDate}T00:00:00`);
        }
        
        if (endDate) {
            query = query.lte('data_horario', `${endDate}T23:59:59`);
        }
        
        const { data, error } = await query;
        
        if (error) throw error;
        
        renderReports(data || []);
        
    } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
    }
}

// Renderização
function renderAppointmentsTable() {
    const tbody = document.getElementById('appointmentsTableBody');
    if (!tbody) {
        console.error('Elemento appointmentsTableBody não encontrado');
        return;
    }
    
    console.log('Renderizando tabela de agendamentos. Total:', appointments.length);
    tbody.innerHTML = '';
    
    if (appointments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: rgba(255,255,255,0.5);">Nenhum agendamento encontrado</td></tr>';
        return;
    }
    
    appointments.forEach(appointment => {
        const row = document.createElement('tr');
        const appointmentDate = new Date(appointment.data_horario);
        const dateStr = appointmentDate.toLocaleDateString('pt-BR');
        const timeStr = getFormattedTime(appointment);
        
        row.innerHTML = `
            <td>${appointment.nome_cliente}</td>
            <td>${appointment.telefone}</td>
            <td>${appointment.servico || 'Corte'}</td>
            <td>${dateStr}</td>
            <td>${timeStr}</td>
            <td>R$ ${(appointment.preco || 0).toFixed(2)}</td>
            <td><span class="status-badge status-${appointment.status}">${appointment.status}</span></td>
            <td>
                <button class="action-btn btn-edit" onclick="editAppointment(${appointment.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn btn-delete" onclick="deleteAppointment(${appointment.id})">
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
    
    console.log('Renderizando agendamentos de hoje. Total:', todayAppointments.length);
    container.innerHTML = '';
    
    if (todayAppointments.length === 0) {
        container.innerHTML = '<p style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">Nenhum agendamento para hoje</p>';
        console.log('Nenhum agendamento para exibir');
        return;
    }

    // Ordenar agendamentos por horário
    const sortedAppointments = [...todayAppointments].sort((a, b) => {
        const timeA = getFormattedTime(a);
        const timeB = getFormattedTime(b);
        return timeA.localeCompare(timeB);
    });

    // Renderizar cada agendamento
    let htmlContent = '';
    sortedAppointments.forEach(appointment => {
        const appointmentDate = new Date(appointment.data_horario);
        const timeStr = getFormattedTime(appointment);
        
        console.log(`Renderizando agendamento ID: ${appointment.id} - ${appointment.nome_cliente}`);
        
        htmlContent += `
            <div class="schedule-item" data-period="${getTimePeriod(appointment)}">
                <div class="schedule-item-info">
                    <div class="schedule-time">${timeStr}</div>
                    <div class="schedule-client">${appointment.nome_cliente}</div>
                    <div class="schedule-service">${appointment.servico || 'Corte'}</div>
                </div>
                <div class="schedule-actions">
                    <span class="status-badge status-${appointment.status}">${appointment.status}</span>
                    <button class="action-btn btn-edit" onclick="window.editAppointment(${appointment.id})" title="Editar" data-id="${appointment.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn btn-delete" onclick="window.deleteAppointment(${appointment.id})" title="Excluir" data-id="${appointment.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });
    
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
    
    console.log(`Configurando event listeners: ${editButtons.length} botões editar, ${deleteButtons.length} botões deletar`);
    
    editButtons.forEach(button => {
        const appointmentId = button.getAttribute('data-id');
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`Botão editar clicado para ID: ${appointmentId}`);
            editAppointment(appointmentId);
        });
    });
    
    deleteButtons.forEach(button => {
        const appointmentId = button.getAttribute('data-id');
        button.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log(`Botão deletar clicado para ID: ${appointmentId}`);
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
    console.log('Configurando filtros de turno. Botões encontrados:', filterButtons.length);
    
    if (filterButtons.length === 0) {
        console.warn('Nenhum botão de filtro encontrado');
        return;
    }
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            console.log('Filtro clicado:', this.getAttribute('data-period'));
            
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
    console.log('Todos os agendamentos:', appointments);
    console.log('Data selecionada:', selectedDate);
    
    // Filtrar agendamentos para a data selecionada
    const dayAppointments = appointments.filter(appointment => {
        const appointmentDate = new Date(appointment.data_horario);
        const selectedDateObj = new Date(selectedDate + 'T00:00:00');
        
        // Comparar apenas a data (ano, mês, dia)
        return appointmentDate.toDateString() === selectedDateObj.toDateString();
    });
    
    console.log('Agendamentos do dia filtrados:', dayAppointments);
    
    dayAppointments.forEach(appointment => {
        // Extrair horário do agendamento - pode vir de horario_inicio ou data_horario
        let timeSlot;
        if (appointment.horario_inicio) {
            timeSlot = formatTimeHHMM(appointment.horario_inicio);
        } else if (appointment.data_horario) {
            // Extrair horário da data_horario
            const appointmentDate = new Date(appointment.data_horario);
            const hours = appointmentDate.getHours().toString().padStart(2, '0');
            const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
            timeSlot = `${hours}:${minutes}`;
        }
        
        if (timeSlot) {
            appointmentMap[timeSlot] = appointment;
            console.log(`Mapeando agendamento: ${timeSlot} -> ${appointment.nome_cliente}`);
        }
    });
    
    console.log('Mapa de agendamentos final:', appointmentMap);

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
                        
                        return `
                            <div class="time-slot ${status}" data-time="${time}" onclick="handleTimeSlotClick('${time}', '${selectedDate}', ${appointment ? 'true' : 'false'})">
                                <div class="slot-time">${time}</div>
                                ${appointment ? `<div class="slot-client">${appointment.nome_cliente}</div>` : ''}
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
                        
                        return `
                            <div class="time-slot ${status}" data-time="${time}" onclick="handleTimeSlotClick('${time}', '${selectedDate}', ${appointment ? 'true' : 'false'})">
                                <div class="slot-time">${time}</div>
                                ${appointment ? `<div class="slot-client">${appointment.nome_cliente}</div>` : ''}
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
    // Estatísticas por status
    const statusStats = {};
    data.forEach(appointment => {
        statusStats[appointment.status] = (statusStats[appointment.status] || 0) + 1;
    });
    
    const summaryContainer = document.getElementById('reportSummary');
    summaryContainer.innerHTML = '';
    
    Object.entries(statusStats).forEach(([status, count]) => {
        const item = document.createElement('div');
        item.className = 'summary-item';
        item.innerHTML = `
            <span class="summary-label">${status.charAt(0).toUpperCase() + status.slice(1)}:</span>
            <span class="summary-value">${count}</span>
        `;
        summaryContainer.appendChild(item);
    });
    
    // Total de agendamentos
    const totalItem = document.createElement('div');
    totalItem.className = 'summary-item';
    totalItem.innerHTML = `
        <span class="summary-label">Total de Agendamentos:</span>
        <span class="summary-value">${data.length}</span>
    `;
    summaryContainer.appendChild(totalItem);
}

// Utilitários
function formatDate(dateString) {
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('pt-BR');
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

function filterClients() {
    const searchTerm = document.getElementById('clientSearch').value.toLowerCase();
    const clientCards = document.querySelectorAll('.client-card');
    
    clientCards.forEach(card => {
        const clientName = card.querySelector('.client-name').textContent.toLowerCase();
        const clientPhone = card.querySelector('.client-phone').textContent.toLowerCase();
        
        if (clientName.includes(searchTerm) || clientPhone.includes(searchTerm)) {
            card.style.display = 'block';
        } else {
            card.style.display = 'none';
        }
    });
}

function updateReportData() {
    loadReports();
}

function generateReport() {
    loadReports();
}

function filterAppointments() {
    const searchTerm = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    // Esta função pode ser implementada se necessário
}

function generateReport() {
    const startDate = document.getElementById('reportStartDate').value;
    const endDate = document.getElementById('reportEndDate').value;
    
    if (!startDate || !endDate) {
        alert('Por favor, selecione as datas de início e fim do relatório.');
        return;
    }
    
    loadReports();
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
        // Modo exemplo - buscar nos dados locais
        const appointment = appointments.find(apt => apt.id == id);
        if (!appointment) {
            alert('Agendamento não encontrado');
            return;
        }
        
        // Preencher campos do modal
        document.getElementById('editId').value = appointment.id;
        
        // Extrair data e horário do timestamp
        const appointmentDate = new Date(appointment.data_horario);
        document.getElementById('editData').value = appointmentDate.toISOString().split('T')[0];
        
        // Garantir formato HH:MM para o horário
        let timeValue = appointment.horario_inicio;
        if (!timeValue) {
            const hours = appointmentDate.getHours().toString().padStart(2, '0');
            const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
            timeValue = `${hours}:${minutes}`;
        }
        // Remover segundos se existirem (formato HH:MM:SS -> HH:MM)
        if (timeValue.includes(':') && timeValue.split(':').length === 3) {
            timeValue = timeValue.substring(0, 5);
        }
        document.getElementById('editHorario').value = timeValue;
        
        // Preencher nome e telefone do cliente
        document.getElementById('editNome').value = appointment.nome_cliente || '';
        document.getElementById('editTelefone').value = appointment.telefone || '';
        
        document.getElementById('editServico').value = appointment.servico || '';
        document.getElementById('editStatus').value = appointment.status || 'agendado';
        document.getElementById('editObservacoes').value = appointment.observacoes || '';
        document.getElementById('editPreco').value = appointment.preco || '';
        
        // Mostrar modal
        document.getElementById('editModal').style.display = 'block';
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
        
        // Garantir formato HH:MM para o horário
        let timeValue = appointment.horario_inicio;
        if (!timeValue) {
            const hours = appointmentDate.getHours().toString().padStart(2, '0');
            const minutes = appointmentDate.getMinutes().toString().padStart(2, '0');
            timeValue = `${hours}:${minutes}`;
        }
        // Remover segundos se existirem (formato HH:MM:SS -> HH:MM)
        if (timeValue.includes(':') && timeValue.split(':').length === 3) {
            timeValue = timeValue.substring(0, 5);
        }
        document.getElementById('editHorario').value = timeValue;
        
        // Preencher nome e telefone do cliente
        document.getElementById('editNome').value = appointment.nome_cliente || '';
        document.getElementById('editTelefone').value = appointment.telefone || '';
        
        document.getElementById('editServico').value = appointment.servico || '';
        document.getElementById('editStatus').value = appointment.status || 'agendado';
        document.getElementById('editObservacoes').value = appointment.observacoes || '';
        document.getElementById('editPreco').value = appointment.preco || '';
        
        // Mostrar modal
        document.getElementById('editModal').style.display = 'block';
    } catch (error) {
        console.error('Erro ao carregar agendamento:', error);
        alert('Erro ao carregar dados do agendamento: ' + error.message);
    }
}

async function saveAppointment() {
    console.log('=== INICIANDO SAVE APPOINTMENT ===');
    
    try {
        // Obter dados do formulário
        const id = document.getElementById('editId').value;
        const clienteNome = document.getElementById('editNome').value.trim();
        const clienteTelefone = document.getElementById('editTelefone').value.trim();
        const data = document.getElementById('editData').value;
        const horario = document.getElementById('editHorario').value;
        const servico = document.getElementById('editServico').value;
        const status = document.getElementById('editStatus').value;
        const observacoes = document.getElementById('editObservacoes').value.trim();
        const preco = parseFloat(document.getElementById('editPreco')?.value || 0);
        
        console.log('Dados do formulário:', { id, clienteNome, clienteTelefone, data, horario, servico, status, preco });
        
        // Validações básicas
        if (!id || !clienteNome || !data || !horario || !servico) {
            console.log('Validação falhou - campos obrigatórios vazios');
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        
        // Validar formato do horário (HH:MM)
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(horario)) {
            console.log('Validação falhou - formato de horário inválido:', horario);
            alert('Formato de horário inválido. Use HH:MM (ex: 14:30)');
            return;
        }
        
        // Combinar data e horário em um timestamp válido
        const dataHorario = new Date(`${data}T${horario}:00`);
        console.log('Data/horário combinados:', dataHorario);
        
        // Verificar se a data é válida
        if (isNaN(dataHorario.getTime())) {
            console.log('Data/horário inválido:', data, horario);
            alert('Data ou horário inválido');
            return;
        }
        
        // Calcular horário de fim baseado na duração do serviço (30 min padrão)
        const horarioFim = calculateEndTime(horario, 30);
        
        if (!supabaseClient) {
            console.log('Modo exemplo - salvando dados locais');
            
            // Encontrar e atualizar o agendamento
            const appointmentIndex = appointments.findIndex(apt => apt.id == id);
            if (appointmentIndex === -1) {
                console.log('Agendamento não encontrado com ID:', id);
                alert('Agendamento não encontrado');
                return;
            }
            
            // Atualizar o agendamento
            const updatedAppointment = {
                ...appointments[appointmentIndex],
                telefone: normalizePhone(clienteTelefone),
                nome_cliente: clienteNome,
                servico: servico,
                data_horario: dataHorario.toISOString(),
                horario_inicio: horario,
                horario_fim: horarioFim,
                preco: preco,
                status: status,
                observacoes: observacoes || null
            };
            
            console.log('Agendamento atualizado:', updatedAppointment);
            appointments[appointmentIndex] = updatedAppointment;
            
            // Atualizar agendamentos de hoje se necessário
            const today = new Date().toISOString().split('T')[0];
            if (data === today) {
                const todayIndex = todayAppointments.findIndex(apt => apt.id == id);
                if (todayIndex !== -1) {
                    todayAppointments[todayIndex] = updatedAppointment;
                } else {
                    todayAppointments.push(updatedAppointment);
                }
            }
            
            closeModal();
            renderAppointmentsTable();
            renderTodaySchedule();
            loadScheduleGrid();
            
            alert('Agendamento atualizado com sucesso!');
            console.log('=== SAVE APPOINTMENT CONCLUÍDO COM SUCESSO (EXEMPLO) ===');
            return;
        }
        
        console.log('Modo Supabase - salvando no banco');
        
        // Preparar dados para o Supabase
        const updatedData = {
            telefone: normalizePhone(clienteTelefone),
            nome_cliente: clienteNome,
            servico: servico,
            data_horario: dataHorario.toISOString(),
            horario_inicio: horario,
            horario_fim: horarioFim,
            preco: preco,
            status: status,
            observacoes: observacoes || null,
            atualizado_em: new Date().toISOString()
        };
        
        console.log('Dados para atualização (Supabase):', updatedData);
        
        const { data: result, error } = await supabaseClient
            .from('agendamentos')
            .update(updatedData)
            .eq('id', parseInt(id))
            .select();
        
        if (error) {
            console.error('Erro do Supabase:', error);
            throw error;
        }
        
        console.log('Resultado da atualização:', result);
        
        closeModal();
        loadAppointments();
        loadTodayAppointments();
        loadOverviewData();
        loadScheduleGrid();
        
        alert('Agendamento atualizado com sucesso!');
        console.log('=== SAVE APPOINTMENT CONCLUÍDO COM SUCESSO (SUPABASE) ===');
        
    } catch (error) {
        console.error('Erro ao salvar agendamento:', error);
        alert('Erro ao salvar agendamento: ' + (error.message || 'Erro desconhecido'));
    }
}

async function deleteAppointment(id) {
    if (!confirm('Tem certeza que deseja excluir este agendamento?')) {
        return;
    }
    
    console.log('=== INICIANDO DELETE APPOINTMENT ===', id);
    
    try {
        if (!supabaseClient) {
            console.log('Modo exemplo - excluindo dos dados locais');
            
            // Encontrar e remover o agendamento
            const appointmentIndex = appointments.findIndex(apt => apt.id == id);
            if (appointmentIndex === -1) {
                alert('Agendamento não encontrado');
                return;
            }
            
            console.log('Agendamento encontrado no índice:', appointmentIndex);
            
            // Remover dos arrays
            appointments.splice(appointmentIndex, 1);
            
            // Remover dos agendamentos de hoje se necessário
            const todayIndex = todayAppointments.findIndex(apt => apt.id == id);
            if (todayIndex !== -1) {
                todayAppointments.splice(todayIndex, 1);
                console.log('Agendamento removido dos agendamentos de hoje');
            }
            
            renderAppointmentsTable();
            renderTodaySchedule();
            loadScheduleGrid();
            loadOverviewData();
            
            alert('Agendamento excluído com sucesso!');
            console.log('=== DELETE APPOINTMENT CONCLUÍDO COM SUCESSO (EXEMPLO) ===');
            return;
        }
        
        console.log('Modo Supabase - excluindo do banco');
        console.log('ID para exclusão:', id, 'Tipo:', typeof id);
        
        const { data: result, error } = await supabaseClient
            .from('agendamentos')
            .delete()
            .eq('id', parseInt(id));
        
        if (error) {
            console.error('Erro do Supabase:', error);
            throw error;
        }
        
        console.log('Resultado da exclusão:', result);
        
        // Recarregar todas as visualizações
        await loadAppointments();
        await loadTodayAppointments();
        await loadOverviewData();
        await loadScheduleGrid();
        await loadAllClients(); // Recarregar clientes também
        
        alert('Agendamento excluído com sucesso!');
        console.log('=== DELETE APPOINTMENT CONCLUÍDO COM SUCESSO (SUPABASE) ===');
        
    } catch (error) {
        console.error('Erro ao excluir agendamento:', error);
        alert('Erro ao excluir agendamento: ' + (error.message || 'Erro desconhecido'));
    }
}

// Função para excluir cliente
async function deleteClient(telefone) {
    if (!confirm('Tem certeza que deseja excluir este cliente? Todos os agendamentos relacionados também serão excluídos.')) {
        return;
    }
    
    console.log('=== INICIANDO DELETE CLIENT ===', telefone);
    
    try {
        if (!supabaseClient) {
            console.log('Modo exemplo - excluindo cliente dos dados locais');
            
            // Remover cliente da lista
            const clientIndex = allClients.findIndex(client => phonesMatch(client.telefone, telefone));
            if (clientIndex !== -1) {
                allClients.splice(clientIndex, 1);
            }
            
            // Remover agendamentos do cliente
            appointments = appointments.filter(apt => !phonesMatch(apt.telefone, telefone));
            todayAppointments = todayAppointments.filter(apt => !phonesMatch(apt.telefone, telefone));
            
            // Recarregar visualizações
            renderAppointmentsTable();
            renderTodaySchedule();
            loadScheduleGrid();
            loadOverviewData();
            loadClients();
            
            alert('Cliente excluído com sucesso!');
            return;
        }
        
        console.log('Modo Supabase - excluindo cliente do banco');
        
        // Normalizar telefone para busca
        const normalizedPhone = normalizePhone(telefone);
        
        // Excluir todos os agendamentos do cliente
        const { error: appointmentsError } = await supabaseClient
            .from('agendamentos')
            .delete()
            .eq('telefone', normalizedPhone);
        
        if (appointmentsError) {
            console.error('Erro ao excluir agendamentos:', appointmentsError);
            throw appointmentsError;
        }
        
        // Recarregar todas as visualizações
        await loadAppointments();
        await loadTodayAppointments();
        await loadOverviewData();
        await loadScheduleGrid();
        await loadAllClients();
        await loadClients();
        
        alert('Cliente e todos os seus agendamentos foram excluídos com sucesso!');
        console.log('=== DELETE CLIENT CONCLUÍDO COM SUCESSO ===');
        
    } catch (error) {
        console.error('Erro ao excluir cliente:', error);
        alert('Erro ao excluir cliente: ' + (error.message || 'Erro desconhecido'));
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
        console.warn('Supabase não configurado - usando dados de exemplo para clientes');
        allClients = [
            { id: 1, nome: 'João Silva', telefone: '(11) 99999-9999' },
            { id: 2, nome: 'Pedro Santos', telefone: '(11) 88888-8888' }
        ];
        return;
    }
    
    try {
        // Buscar clientes únicos da tabela de agendamentos
        const { data, error } = await supabaseClient
            .from('agendamentos')
            .select('nome_cliente, telefone')
            .order('nome_cliente');
        
        if (error) throw error;
        
        // Criar lista de clientes únicos baseada no telefone normalizado
        const uniqueClients = [];
        const seenPhones = new Set();
        
        data?.forEach((appointment, index) => {
            if (appointment.telefone) {
                const normalizedPhone = normalizePhone(appointment.telefone);
                
                if (!seenPhones.has(normalizedPhone)) {
                    seenPhones.add(normalizedPhone);
                    uniqueClients.push({
                        id: index + 1, // ID temporário
                        nome: appointment.nome_cliente,
                        telefone: normalizedPhone, // Usar telefone normalizado
                        originalPhone: appointment.telefone // Manter original para referência
                    });
                }
            }
        });
        
        allClients = uniqueClients;
    } catch (error) {
        console.error('Erro ao carregar clientes:', error);
        allClients = [];
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
        const { data, error } = await supabaseClient
            .from('agendamentos')
            .select('nome_cliente')
            .eq('telefone', phone)
            .limit(1)
            .single();
        
        if (error) throw error;
        return data?.nome_cliente || `Cliente: ${phone}`;
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
                <button class="client-delete-btn" onclick="deleteClient('${client.telefone}')" title="Excluir Cliente">
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

function renderReports(data) {
    // Implementar renderização de relatórios
    console.log('Renderizando relatórios com dados:', data);
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
    document.getElementById('addHorario').value = '';
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

// Função para atualizar preço baseado no serviço selecionado
function updateServicePrice() {
    const servicoSelect = document.getElementById('addServico');
    const precoInput = document.getElementById('addPreco');
    const selectedOption = servicoSelect.options[servicoSelect.selectedIndex];
    
    if (selectedOption && selectedOption.dataset.price) {
        precoInput.value = selectedOption.dataset.price;
    } else {
        precoInput.value = '';
    }
}

function updateEditServicePrice() {
    const servicoSelect = document.getElementById('editServico');
    const precoInput = document.getElementById('editPreco');
    const selectedOption = servicoSelect.options[servicoSelect.selectedIndex];
    
    if (selectedOption && selectedOption.dataset.price) {
        precoInput.value = selectedOption.dataset.price;
    } else {
        precoInput.value = '';
    }
}

// Função para adicionar novo agendamento
async function addNewAppointment(event) {
    event.preventDefault();
    
    if (!supabaseClient) {
        // Modo exemplo - adicionar aos dados locais
        const clienteNome = document.getElementById('addNome').value.trim();
        const clienteTelefone = document.getElementById('addTelefone').value.trim();
        const servico = document.getElementById('addServico').value;
        const data = document.getElementById('addData').value;
        const horario = document.getElementById('addHorario').value;
        const preco = parseFloat(document.getElementById('addPreco').value) || 0;
        const status = document.getElementById('addStatus').value;
        const observacoes = document.getElementById('addObservacoes').value.trim();
        
        // Validações
        if (!clienteNome || !servico || !data || !horario) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        
        // Verificar se o horário já está ocupado nos dados locais
        const dataHorario = new Date(`${data}T${horario}:00`);
        const existingAppointment = appointments.find(apt => {
            const aptDate = new Date(apt.data_horario);
            return aptDate.toDateString() === dataHorario.toDateString() && 
                   apt.horario_inicio === horario;
        });
        
        if (existingAppointment) {
            alert('Este horário já está ocupado. Por favor, escolha outro horário.');
            return;
        }
        
        // Criar novo agendamento
        // Calcular horário de fim baseado na duração do serviço (30 min padrão)
        const horarioFim = calculateEndTime(horario, 30);
        
        const newAppointment = {
            id: Date.now(), // ID temporário
            telefone: normalizePhone(clienteTelefone),
            nome_cliente: clienteNome,
            servico: servico,
            data_horario: dataHorario.toISOString(),
            horario_inicio: horario,
            horario_fim: horarioFim,
            preco: preco,
            status: status,
            observacoes: observacoes || null
        };
        
        // Adicionar aos dados locais
        appointments.push(newAppointment);
        
        // Atualizar agendamentos de hoje se for hoje
        const today = new Date().toISOString().split('T')[0];
        if (data === today) {
            todayAppointments.push(newAppointment);
        }
        
        // Fechar modal e recarregar dados
        closeAddModal();
        renderAppointmentsTable();
        renderTodaySchedule();
        loadScheduleGrid();
        
        showNotification('Agendamento criado com sucesso!', 'success');
        return;
    }
    
    try {
        const clienteNome = document.getElementById('addNome').value.trim();
        const clienteTelefone = document.getElementById('addTelefone').value.trim();
        const servico = document.getElementById('addServico').value;
        const data = document.getElementById('addData').value;
        const horario = document.getElementById('addHorario').value;
        const preco = parseFloat(document.getElementById('addPreco').value) || 0;
        const status = document.getElementById('addStatus').value;
        const observacoes = document.getElementById('addObservacoes').value.trim();
        
        // Validações
        if (!clienteNome || !servico || !data || !horario) {
            alert('Por favor, preencha todos os campos obrigatórios.');
            return;
        }
        
        // Verificar se o horário já está ocupado
        const { data: existingAppointments, error: checkError } = await supabaseClient
            .from('agendamentos')
            .select('id')
            .gte('data_horario', `${data}T00:00:00`)
            .lte('data_horario', `${data}T23:59:59`)
            .eq('horario_inicio', horario);
        
        if (checkError) throw checkError;
        
        if (existingAppointments && existingAppointments.length > 0) {
            alert('Este horário já está ocupado. Por favor, escolha outro horário.');
            return;
        }
        
        // Combinar data e horário em um timestamp
        const dataHorario = new Date(`${data}T${horario}:00`);
        
        // Calcular horário de fim baseado na duração do serviço (30 min padrão)
        const horarioFim = calculateEndTime(horario, 30);
        
        const newAppointment = {
            telefone: normalizePhone(clienteTelefone),
            nome_cliente: clienteNome,
            servico: servico,
            data_horario: dataHorario.toISOString(),
            horario_inicio: horario,
            horario_fim: horarioFim,
            preco: preco,
            status: status,
            observacoes: observacoes || null
        };
        
        console.log('Dados do agendamento:', newAppointment);
        
        const { error } = await supabaseClient
            .from('agendamentos')
            .insert([newAppointment]);
        
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
    document.getElementById('addHorario').value = time;
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
    
    console.log('✅ Funções editAppointment e deleteAppointment disponíveis globalmente');
});