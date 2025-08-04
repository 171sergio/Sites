// ===== CONFIGURAÇÃO E CONSTANTES =====
class Config {
    static VALID_CREDENTIALS = {
        username: 'jaonegro',
        password: 'crioulo'
    };
    
    static CACHE_TTL = 300000; // 5 minutos
    static DEFAULT_APPOINTMENT_DURATION = 30; // minutos
    static DEFAULT_DDD = '31'; // Belo Horizonte
}

// ===== UTILITÁRIOS =====
class PhoneUtils {
    static normalize(phone) {
        if (!phone) return '';
        
        let normalized = phone.replace(/\D/g, '');
        
        // Remove código do país se presente
        if ((normalized.length === 13 || normalized.length === 12) && normalized.startsWith('55')) {
            normalized = normalized.substring(2);
        }
        
        // Formato correto: 11 dígitos (DDD + 9 + número)
        if (normalized.length === 11) {
            return normalized;
        }
        
        // 10 dígitos: adiciona o 9 após o DDD
        if (normalized.length === 10) {
            const ddd = normalized.substring(0, 2);
            const numero = normalized.substring(2);
            normalized = ddd + '9' + numero;
        }
        
        // 9 dígitos: adiciona DDD padrão
        if (normalized.length === 9) {
            normalized = Config.DEFAULT_DDD + normalized;
        }
        
        // 8 dígitos: adiciona DDD e o 9
        if (normalized.length === 8) {
            normalized = Config.DEFAULT_DDD + '9' + normalized;
        }
        
        return normalized;
    }
    
    static formatForDisplay(phone) {
        const normalized = this.normalize(phone);
        
        if (normalized.length === 11) {
            const ddd = normalized.substring(0, 2);
            const firstPart = normalized.substring(2, 7);
            const secondPart = normalized.substring(7);
            return `(${ddd}) ${firstPart}-${secondPart}`;
        }
        
        return phone;
    }
    
    static areEqual(phone1, phone2) {
        return this.normalize(phone1) === this.normalize(phone2);
    }
}

class TimeUtils {
    static formatHHMM(timeString) {
        if (!timeString) return '';
        
        if (timeString.match(/^\d{1,2}:\d{2}$/)) {
            return timeString;
        }
        
        if (timeString.includes(':') && timeString.split(':').length === 3) {
            return timeString.substring(0, 5);
        }
        
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
    
    static calculateEndTime(startTime, durationMinutes = Config.DEFAULT_APPOINTMENT_DURATION) {
        const [hours, minutes] = startTime.split(':').map(Number);
        const endTime = new Date();
        endTime.setHours(hours, minutes + durationMinutes, 0, 0);
        const endHours = endTime.getHours().toString().padStart(2, '0');
        const endMinutes = endTime.getMinutes().toString().padStart(2, '0');
        return `${endHours}:${endMinutes}`;
    }
    
    static getOccupiedTimeSlots(startTime, endTime) {
        const slots = [];
        
        if (!startTime) return slots;
        
        if (!endTime) {
            endTime = this.calculateEndTime(startTime);
        }
        
        const [startHours, startMinutes] = startTime.split(':').map(Number);
        const [endHours, endMinutes] = endTime.split(':').map(Number);
        
        const startTotalMinutes = startHours * 60 + startMinutes;
        const endTotalMinutes = endHours * 60 + endMinutes;
        
        for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;
            const timeSlot = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
            slots.push(timeSlot);
        }
        
        return slots;
    }
    
    static getTodayDate() {
        return new Date().toISOString().split('T')[0];
    }
    
    static getTomorrowDate() {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    }
}

class ValidationUtils {
    static isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
    
    static isValidPhone(phone) {
        const normalized = PhoneUtils.normalize(phone);
        return normalized.length >= 10 && normalized.length <= 11;
    }
    
    static isValidName(name) {
        return name && name.trim().length >= 2;
    }
}

class DOMUtils {
    static debounce(func, wait) {
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
    
    static showElement(element) {
        if (element) element.style.display = 'block';
    }
    
    static hideElement(element) {
        if (element) element.style.display = 'none';
    }
    
    static toggleElement(element, show) {
        if (show) {
            this.showElement(element);
        } else {
            this.hideElement(element);
        }
    }
}

// ===== GERENCIAMENTO DE CACHE =====
class CacheManager {
    constructor() {
        this.dataCache = new Map();
        this.clientsCache = new Map();
        this.servicesCache = new Map();
    }
    
    getCachedData(key, fetchFunction, ttl = Config.CACHE_TTL) {
        const cached = this.dataCache.get(key);
        if (cached && Date.now() - cached.timestamp < ttl) {
            return Promise.resolve(cached.data);
        }
        
        return fetchFunction().then(data => {
            this.dataCache.set(key, { data, timestamp: Date.now() });
            return data;
        });
    }
    
    clearCache(key = null) {
        if (key) {
            this.dataCache.delete(key);
        } else {
            this.dataCache.clear();
        }
    }
    
    setClient(id, client) {
        this.clientsCache.set(id, client);
    }
    
    getClient(id) {
        return this.clientsCache.get(id);
    }
    
    setService(id, service) {
        this.servicesCache.set(id, service);
    }
    
    getService(id) {
        return this.servicesCache.get(id);
    }
}

// ===== GERENCIAMENTO DO SUPABASE =====
class SupabaseManager {
    constructor() {
        this.client = null;
        this.isConfigured = false;
        this.initialize();
    }
    
    initialize() {
        if (typeof SUPABASE_CONFIG !== 'undefined' && 
            SUPABASE_CONFIG.url && 
            SUPABASE_CONFIG.anonKey &&
            SUPABASE_CONFIG.url !== 'https://your-project-ref.supabase.co' &&
            SUPABASE_CONFIG.anonKey !== 'your-anon-key-here') {
            
            try {
                if (typeof supabase !== 'undefined' && supabase.createClient) {
                    const { createClient } = supabase;
                    this.client = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);
                    this.isConfigured = true;
                    console.log('✅ Supabase configurado com sucesso!');
                } else {
                    throw new Error('Biblioteca Supabase não carregada');
                }
            } catch (error) {
                console.error('❌ Erro ao configurar Supabase:', error);
                this.handleConfigurationError();
            }
        } else {
            this.handleConfigurationError();
        }
    }
    
    handleConfigurationError() {
        alert('❌ Erro: Supabase não configurado. Configure o arquivo config.js para usar o sistema.');
        console.error('❌ Supabase não configurado. Configure o arquivo config.js');
        this.isConfigured = false;
        this.client = null;
    }
    
    getClient() {
        return this.client;
    }
    
    isReady() {
        return this.isConfigured && this.client !== null;
    }
}

// ===== SERVIÇOS DE DADOS =====
class BaseService {
    constructor(supabaseManager, cacheManager) {
        this.supabase = supabaseManager;
        this.cache = cacheManager;
    }
    
    checkSupabaseConnection() {
        if (!this.supabase.isReady()) {
            throw new Error('Supabase não configurado');
        }
    }
}

class ClientService extends BaseService {
    async findOrCreate(telefone, nome) {
        this.checkSupabaseConnection();
        
        const normalizedPhone = PhoneUtils.normalize(telefone);
        
        try {
            // Tentar encontrar cliente existente
            const { data: existingClient, error: searchError } = await this.supabase.getClient()
                .from('clientes')
                .select('*')
                .eq('telefone', normalizedPhone)
                .single();
            
            if (existingClient) {
                this.cache.setClient(existingClient.id, existingClient);
                return existingClient;
            }
            
            // Criar novo cliente
            const { data: newClient, error: createError } = await this.supabase.getClient()
                .from('clientes')
                .insert([{
                    telefone: normalizedPhone,
                    nome: nome,
                    status_cliente: 'ativo'
                }])
                .select()
                .single();
            
            if (createError) throw createError;
            
            this.cache.setClient(newClient.id, newClient);
            return newClient;
        } catch (error) {
            console.error('Erro ao buscar/criar cliente:', error);
            throw error;
        }
    }
    
    async loadAll() {
        this.checkSupabaseConnection();
        
        try {
            const { data, error } = await this.supabase.getClient()
                .from('clientes')
                .select('*')
                .order('criado_em', { ascending: false });
            
            if (error) throw error;
            
            // Atualizar cache
            data?.forEach(client => {
                this.cache.setClient(client.id, client);
            });
            
            return data || [];
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            return [];
        }
    }
    
    async create(clientData) {
        this.checkSupabaseConnection();
        
        const normalizedData = {
            ...clientData,
            telefone: PhoneUtils.normalize(clientData.telefone)
        };
        
        const { data, error } = await this.supabase.getClient()
            .from('clientes')
            .insert([normalizedData])
            .select()
            .single();
        
        if (error) throw error;
        
        this.cache.setClient(data.id, data);
        return data;
    }
    
    async update(id, clientData) {
        this.checkSupabaseConnection();
        
        const normalizedData = {
            ...clientData,
            telefone: PhoneUtils.normalize(clientData.telefone)
        };
        
        const { data, error } = await this.supabase.getClient()
            .from('clientes')
            .update(normalizedData)
            .eq('id', id)
            .select()
            .single();
        
        if (error) throw error;
        
        this.cache.setClient(id, data);
        return data;
    }
    
    async delete(id) {
        this.checkSupabaseConnection();
        
        const { error } = await this.supabase.getClient()
            .from('clientes')
            .delete()
            .eq('id', id);
        
        if (error) throw error;
        
        this.cache.clientsCache.delete(id);
    }
    
    async checkPhoneExists(phone, excludeId = null) {
        this.checkSupabaseConnection();
        
        const normalizedPhone = PhoneUtils.normalize(phone);
        let query = this.supabase.getClient()
            .from('clientes')
            .select('id')
            .eq('telefone', normalizedPhone);
        
        if (excludeId) {
            query = query.neq('id', excludeId);
        }
        
        const { data } = await query.single();
        return !!data;
    }
}

class ServiceService extends BaseService {
    async loadAll() {
        this.checkSupabaseConnection();
        
        try {
            const { data, error } = await this.supabase.getClient()
                .from('servicos')
                .select('*')
                .eq('ativo', true)
                .order('categoria', { ascending: true });
            
            if (error) throw error;
            
            // Atualizar cache
            data?.forEach(service => {
                this.cache.setService(service.id, service);
            });
            
            return data || [];
        } catch (error) {
            console.error('Erro ao carregar serviços:', error);
            return [];
        }
    }
}

class AppointmentService extends BaseService {
    async checkTimeConflict(date, startTime, endTime, excludeId = null) {
        if (!this.supabase.isReady()) return { conflict: false };
        
        try {
            let query = this.supabase.getClient()
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
                
                if (
                    (startTime >= aptStart && startTime < aptEnd) ||
                    (endTime > aptStart && endTime <= aptEnd) ||
                    (startTime <= aptStart && endTime >= aptEnd)
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
    
    async loadAll(dateFilter = null, statusFilter = null) {
        this.checkSupabaseConnection();
        
        try {
            let query = this.supabase.getClient()
                .from('vw_agendamentos_completos')
                .select('*');
            
            if (dateFilter) {
                if (dateFilter === 'today') {
                    const today = TimeUtils.getTodayDate();
                    query = query.gte('data_horario', `${today}T00:00:00`)
                                 .lte('data_horario', `${today}T23:59:59`);
                } else if (dateFilter === 'week') {
                    const today = new Date();
                    const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
                    const weekEnd = new Date(today.setDate(today.getDate() - today.getDay() + 6));
                    query = query.gte('data_horario', weekStart.toISOString().split('T')[0])
                                 .lte('data_horario', weekEnd.toISOString().split('T')[0]);
                }
            }
            
            if (statusFilter && statusFilter !== 'all') {
                query = query.eq('status', statusFilter);
            }
            
            query = query.order('data_horario', { ascending: true });
            
            const { data, error } = await query;
            
            if (error) throw error;
            
            return data || [];
        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            return [];
        }
    }
}

// ===== GERENCIAMENTO DE AUTENTICAÇÃO =====
class AuthManager {
    constructor() {
        this.currentUser = null;
        this.loadUserFromStorage();
    }
    
    loadUserFromStorage() {
        const savedUser = localStorage.getItem('currentUser');
        if (savedUser) {
            this.currentUser = JSON.parse(savedUser);
        }
    }
    
    login(username, password) {
        if (username === Config.VALID_CREDENTIALS.username && 
            password === Config.VALID_CREDENTIALS.password) {
            
            this.currentUser = { username: 'Jão', role: 'barbeiro' };
            localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
            return true;
        }
        return false;
    }
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem('currentUser');
    }
    
    isAuthenticated() {
        return this.currentUser !== null;
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
}

// ===== GERENCIAMENTO DE UI =====
class UIManager {
    constructor() {
        this.currentSection = 'overview';
        this.initializeElements();
    }
    
    initializeElements() {
        this.loginScreen = document.getElementById('loginScreen');
        this.dashboard = document.getElementById('dashboard');
        this.loginForm = document.getElementById('loginForm');
        this.errorMessage = document.getElementById('loginError');
        this.userNameSpan = document.getElementById('userName');
        this.loadingElement = document.getElementById('loading');
    }
    
    showLogin() {
        DOMUtils.showElement(this.loginScreen);
        DOMUtils.hideElement(this.dashboard);
        this.clearLoginForm();
        this.hideError();
    }
    
    showDashboard(user) {
        DOMUtils.hideElement(this.loginScreen);
        DOMUtils.showElement(this.dashboard);
        if (this.userNameSpan) {
            this.userNameSpan.textContent = user.username;
        }
        this.showSection('overview');
    }
    
    clearLoginForm() {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');
        if (usernameInput) usernameInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }
    
    showError(message) {
        if (this.errorMessage) {
            this.errorMessage.textContent = message;
            DOMUtils.showElement(this.errorMessage);
        }
    }
    
    hideError() {
        if (this.errorMessage) {
            DOMUtils.hideElement(this.errorMessage);
        }
    }
    
    showLoading() {
        if (this.loadingElement) {
            DOMUtils.showElement(this.loadingElement);
        }
    }
    
    hideLoading() {
        if (this.loadingElement) {
            DOMUtils.hideElement(this.loadingElement);
        }
    }
    
    showSection(sectionId) {
        // Atualizar navegação ativa
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }
        
        // Mostrar seção
        document.querySelectorAll('.content-section').forEach(section => {
            section.classList.remove('active');
        });
        const activeSection = document.getElementById(sectionId);
        if (activeSection) {
            activeSection.classList.add('active');
        }
        
        this.currentSection = sectionId;
    }
    
    showNotification(message, type = 'info') {
        // Implementar sistema de notificações
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // Fallback para alert em casos críticos
        if (type === 'error') {
            alert(message);
        }
    }
    
    setDefaultDates() {
        const today = TimeUtils.getTodayDate();
        
        const currentDateInput = document.getElementById('currentDate');
        if (currentDateInput && !currentDateInput.value) {
            currentDateInput.value = today;
        }
        
        const scheduleDateInput = document.getElementById('scheduleDate');
        if (scheduleDateInput && !scheduleDateInput.value) {
            scheduleDateInput.value = today;
        }
    }
}

// ===== APLICAÇÃO PRINCIPAL =====
class BarbeariaApp {
    constructor() {
        this.supabaseManager = new SupabaseManager();
        this.cacheManager = new CacheManager();
        this.authManager = new AuthManager();
        this.uiManager = new UIManager();
        
        // Inicializar serviços
        this.clientService = new ClientService(this.supabaseManager, this.cacheManager);
        this.serviceService = new ServiceService(this.supabaseManager, this.cacheManager);
        this.appointmentService = new AppointmentService(this.supabaseManager, this.cacheManager);
        
        // Estado da aplicação
        this.clients = [];
        this.services = [];
        this.appointments = [];
        
        this.initialize();
    }
    
    initialize() {
        this.setupEventListeners();
        this.checkAuthentication();
        this.uiManager.setDefaultDates();
    }
    
    checkAuthentication() {
        if (this.authManager.isAuthenticated()) {
            this.uiManager.showDashboard(this.authManager.getCurrentUser());
            this.loadInitialData();
        } else {
            this.uiManager.showLogin();
        }
    }
    
    async loadInitialData() {
        try {
            this.uiManager.showLoading();
            
            // Carregar dados em paralelo
            const [clients, services] = await Promise.all([
                this.clientService.loadAll(),
                this.serviceService.loadAll()
            ]);
            
            this.clients = clients;
            this.services = services;
            
            // Carregar dados específicos da seção atual
            await this.loadSectionData(this.uiManager.currentSection);
            
        } catch (error) {
            console.error('Erro ao carregar dados iniciais:', error);
            this.uiManager.showError('Erro ao carregar dados do sistema');
        } finally {
            this.uiManager.hideLoading();
        }
    }
    
    async loadSectionData(sectionId) {
        switch(sectionId) {
            case 'overview':
                await this.loadOverviewData();
                break;
            case 'appointments':
                await this.loadAppointments();
                break;
            case 'schedule':
                await this.loadScheduleGrid();
                break;
            case 'clients':
                await this.loadClients();
                break;
            case 'reports':
                await this.loadReports();
                break;
            case 'unpaid':
                await this.loadUnpaidClients();
                break;
        }
    }
    
    setupEventListeners() {
        // Login
        if (this.uiManager.loginForm) {
            this.uiManager.loginForm.addEventListener('submit', (e) => this.handleLogin(e));
        }
        
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.handleLogout());
        }
        
        // Navegação
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => this.handleNavigation(e));
        });
        
        // Botões de data
        const todayBtn = document.getElementById('todayBtn');
        if (todayBtn) {
            todayBtn.addEventListener('click', () => this.setDateToToday('currentDate'));
        }
        
        const scheduleTodayBtn = document.getElementById('scheduleTodayBtn');
        if (scheduleTodayBtn) {
            scheduleTodayBtn.addEventListener('click', () => this.setDateToToday('scheduleDate'));
        }
        
        const tomorrowBtn = document.getElementById('tomorrowBtn');
        if (tomorrowBtn) {
            tomorrowBtn.addEventListener('click', () => this.setDateToTomorrow('scheduleDate'));
        }
        
        // Filtros e buscas
        const currentDateInput = document.getElementById('currentDate');
        if (currentDateInput) {
            currentDateInput.addEventListener('change', () => this.loadOverviewData());
        }
        
        const dateFilter = document.getElementById('dateFilter');
        if (dateFilter) {
            dateFilter.addEventListener('change', () => this.loadAppointments());
        }
        
        const statusFilter = document.getElementById('statusFilter');
        if (statusFilter) {
            statusFilter.addEventListener('change', () => this.loadAppointments());
        }
        
        const clientSearch = document.getElementById('clientSearch');
        if (clientSearch) {
            clientSearch.addEventListener('input', DOMUtils.debounce(() => this.filterClients(), 300));
        }
        
        // Refresh buttons
        const refreshAppointments = document.getElementById('refreshAppointments');
        if (refreshAppointments) {
            refreshAppointments.addEventListener('click', () => this.loadAppointments());
        }
    }
    
    async handleLogin(e) {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        if (this.authManager.login(username, password)) {
            this.uiManager.showDashboard(this.authManager.getCurrentUser());
            await this.loadInitialData();
        } else {
            this.uiManager.showError('Usuário ou senha incorretos!');
        }
    }
    
    handleLogout() {
        this.authManager.logout();
        this.uiManager.showLogin();
        
        // Limpar dados
        this.clients = [];
        this.services = [];
        this.appointments = [];
        this.cacheManager.clearCache();
    }
    
    handleNavigation(e) {
        e.preventDefault();
        const sectionId = e.currentTarget.getAttribute('data-section');
        this.uiManager.showSection(sectionId);
        this.loadSectionData(sectionId);
    }
    
    setDateToToday(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = TimeUtils.getTodayDate();
            input.dispatchEvent(new Event('change'));
        }
    }
    
    setDateToTomorrow(inputId) {
        const input = document.getElementById(inputId);
        if (input) {
            input.value = TimeUtils.getTomorrowDate();
            input.dispatchEvent(new Event('change'));
        }
    }
    
    // Métodos de carregamento de dados (implementação simplificada)
    async loadOverviewData() {
        console.log('Carregando dados do overview...');
        // Implementar carregamento de dados do overview
    }
    
    async loadAppointments() {
        try {
            const dateFilter = document.getElementById('dateFilter')?.value;
            const statusFilter = document.getElementById('statusFilter')?.value;
            
            this.appointments = await this.appointmentService.loadAll(dateFilter, statusFilter);
            this.renderAppointments();
        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            this.uiManager.showError('Erro ao carregar agendamentos');
        }
    }
    
    async loadScheduleGrid() {
        console.log('Carregando grade de horários...');
        // Implementar carregamento da grade de horários
    }
    
    async loadClients() {
        try {
            this.clients = await this.clientService.loadAll();
            this.renderClients();
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            this.uiManager.showError('Erro ao carregar clientes');
        }
    }
    
    async loadReports() {
        console.log('Carregando relatórios...');
        // Implementar carregamento de relatórios
    }
    
    async loadUnpaidClients() {
        console.log('Carregando clientes inadimplentes...');
        // Implementar carregamento de clientes inadimplentes
    }
    
    filterClients() {
        const searchTerm = document.getElementById('clientSearch')?.value.toLowerCase() || '';
        const filteredClients = this.clients.filter(client => 
            client.nome.toLowerCase().includes(searchTerm) ||
            PhoneUtils.formatForDisplay(client.telefone).includes(searchTerm)
        );
        this.renderClients(filteredClients);
    }
    
    renderAppointments(appointments = this.appointments) {
        console.log('Renderizando agendamentos:', appointments.length);
        // Implementar renderização de agendamentos
    }
    
    renderClients(clients = this.clients) {
        console.log('Renderizando clientes:', clients.length);
        // Implementar renderização de clientes
    }
}

// ===== INICIALIZAÇÃO =====
let app;

document.addEventListener('DOMContentLoaded', function() {
    app = new BarbeariaApp();
});

// ===== EXPOSIÇÃO DE FUNÇÕES GLOBAIS PARA COMPATIBILIDADE =====
// Manter compatibilidade com HTML existente
window.PhoneUtils = PhoneUtils;
window.TimeUtils = TimeUtils;
window.ValidationUtils = ValidationUtils;

// Funções legadas para compatibilidade
window.normalizePhone = PhoneUtils.normalize;
window.formatPhoneDisplay = PhoneUtils.formatForDisplay;
window.phonesMatch = PhoneUtils.areEqual;
window.formatTimeHHMM = TimeUtils.formatHHMM;
window.calculateEndTime = TimeUtils.calculateEndTime;
window.getOccupiedTimeSlots = TimeUtils.getOccupiedTimeSlots;

// Expor instância da aplicação
window.getBarbeariaApp = () => app;

// Funções de cliente para compatibilidade
window.loadClients = () => app?.loadClients();
window.openAddClientModal = () => console.log('openAddClientModal - implementar');
window.closeAddClientModal = () => console.log('closeAddClientModal - implementar');
window.addClient = () => console.log('addClient - implementar');
window.openEditClientModal = () => console.log('openEditClientModal - implementar');
window.closeEditClientModal = () => console.log('closeEditClientModal - implementar');
window.updateClient = () => console.log('updateClient - implementar');
window.deleteClient = () => console.log('deleteClient - implementar');
window.contactClientDirect = (phone, name) => {
    const normalizedPhone = PhoneUtils.normalize(phone);
    const message = `Olá ${name}! Como está? Aqui é da Barbearia do Jão. Esperamos vê-lo em breve!`;
    const whatsappUrl = `https://wa.me/55${normalizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
};

// Funções de inadimplentes para compatibilidade
window.loadUnpaidClients = () => app?.loadUnpaidClients();
window.markAsPaid = () => console.log('markAsPaid - implementar');
window.contactClient = () => console.log('contactClient - implementar');
window.openAddUnpaidModal = () => console.log('openAddUnpaidModal - implementar');
window.closeAddUnpaidModal = () => console.log('closeAddUnpaidModal - implementar');
window.updateUnpaidServicePrice = () => console.log('updateUnpaidServicePrice - implementar');
window.addUnpaidClient = () => console.log('addUnpaidClient - implementar');

console.log('✅ Sistema da Barbearia do Jão carregado com arquitetura orientada a objetos!');