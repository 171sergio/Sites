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
    
    static formatTime(time) {
        if (!time) return '';
        return time.substring(0, 5); // HH:MM
    }
    
    static timeToMinutes(time) {
        const [hours, minutes] = time.split(':').map(Number);
        return hours * 60 + minutes;
    }
    
    static minutesToTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
    
    static getOccupiedTimeSlots(startTime, endTime) {
        const slots = [];
        
        if (!startTime) return slots;
        
        if (!endTime) {
            endTime = this.calculateEndTime(startTime);
        }
        
        const startTotalMinutes = this.timeToMinutes(startTime);
        const endTotalMinutes = this.timeToMinutes(endTime);
        
        for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
            const timeSlot = this.minutesToTime(minutes);
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
    
    static formatDate(dateString) {
        if (!dateString) return '';
        
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString;
        
        return date.toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
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
        // Para armazenamento local, sempre retorna true
        return true;
    }
}

class ClientService extends BaseService {
    constructor(supabaseManager, cacheManager) {
        super(supabaseManager, cacheManager);
        this.storageKey = 'barbearia_clientes';
        this.initializeStorage();
    }
    
    initializeStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
        }
    }
    
    getClients() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            return [];
        }
    }
    
    saveClients(clients) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(clients));
        } catch (error) {
            console.error('Erro ao salvar clientes:', error);
            throw error;
        }
    }
    
    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }
    
    async findOrCreate(telefone, nome) {
        const normalizedPhone = PhoneUtils.normalize(telefone);
        const clients = this.getClients();
        
        // Tentar encontrar cliente existente
        const existingClient = clients.find(client => 
            PhoneUtils.areEqual(client.telefone, normalizedPhone)
        );
        
        if (existingClient) {
            this.cache.setClient(existingClient.id, existingClient);
            return existingClient;
        }
        
        // Criar novo cliente
        const newClient = {
            id: this.generateId(),
            telefone: normalizedPhone,
            nome: nome,
            status_cliente: 'ativo',
            criado_em: new Date().toISOString(),
            email: '',
            endereco: '',
            observacoes: ''
        };
        
        clients.push(newClient);
        this.saveClients(clients);
        this.cache.setClient(newClient.id, newClient);
        
        return newClient;
    }
    
    async loadAll() {
        const clients = this.getClients();
        
        // Atualizar cache
        clients.forEach(client => {
            this.cache.setClient(client.id, client);
        });
        
        return clients;
    }
    
    async create(clientData) {
        const clients = this.getClients();
        
        const normalizedData = {
            ...clientData,
            id: this.generateId(),
            telefone: PhoneUtils.normalize(clientData.telefone),
            criado_em: new Date().toISOString()
        };
        
        clients.push(normalizedData);
        this.saveClients(clients);
        this.cache.setClient(normalizedData.id, normalizedData);
        
        return normalizedData;
    }
    
    async update(id, clientData) {
        const clients = this.getClients();
        const clientIndex = clients.findIndex(client => client.id === id);
        
        if (clientIndex === -1) {
            throw new Error('Cliente não encontrado');
        }
        
        const normalizedData = {
            ...clients[clientIndex],
            ...clientData,
            telefone: PhoneUtils.normalize(clientData.telefone),
            atualizado_em: new Date().toISOString()
        };
        
        clients[clientIndex] = normalizedData;
        this.saveClients(clients);
        this.cache.setClient(id, normalizedData);
        
        return normalizedData;
    }
    
    async delete(id) {
        const clients = this.getClients();
        const filteredClients = clients.filter(client => client.id !== id);
        
        this.saveClients(filteredClients);
        this.cache.clientsCache.delete(id);
    }
    
    async checkPhoneExists(phone, excludeId = null) {
        const normalizedPhone = PhoneUtils.normalize(phone);
        const clients = this.getClients();
        
        const existingClient = clients.find(client => 
            PhoneUtils.areEqual(client.telefone, normalizedPhone) && 
            client.id !== excludeId
        );
        
        return !!existingClient;
    }
}

class ServiceService extends BaseService {
    constructor(supabaseManager, cacheManager) {
        super(supabaseManager, cacheManager);
        this.storageKey = 'barbearia_servicos';
        this.initializeStorage();
    }
    
    initializeStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            const defaultServices = [
                { id: '1', nome: 'Corte Simples', categoria: 'Corte', preco: 25.00, duracao: 30, ativo: true },
                { id: '2', nome: 'Corte + Barba', categoria: 'Corte', preco: 35.00, duracao: 45, ativo: true },
                { id: '3', nome: 'Barba', categoria: 'Barba', preco: 15.00, duracao: 20, ativo: true },
                { id: '4', nome: 'Sobrancelha', categoria: 'Estética', preco: 10.00, duracao: 15, ativo: true },
                { id: '5', nome: 'Lavagem', categoria: 'Tratamento', preco: 8.00, duracao: 10, ativo: true }
            ];
            localStorage.setItem(this.storageKey, JSON.stringify(defaultServices));
        }
    }
    
    getServices() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (error) {
            console.error('Erro ao carregar serviços:', error);
            return [];
        }
    }
    
    async loadAll() {
        const services = this.getServices().filter(service => service.ativo);
        
        // Atualizar cache
        services.forEach(service => {
            this.cache.setService(service.id, service);
        });
        
        return services;
    }
}

class AppointmentService extends BaseService {
    constructor(supabaseManager, cacheManager) {
        super(supabaseManager, cacheManager);
        this.storageKey = 'barbearia_agendamentos';
        this.initializeStorage();
    }
    
    initializeStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
        }
    }
    
    getAppointments() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            return [];
        }
    }
    
    saveAppointments(appointments) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(appointments));
        } catch (error) {
            console.error('Erro ao salvar agendamentos:', error);
            throw error;
        }
    }
    
    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }
    
    async checkTimeConflict(date, startTime, endTime, excludeId = null) {
        const appointments = this.getAppointments();
        const dayAppointments = appointments.filter(apt => 
            apt.data === date && apt.id !== excludeId && apt.status !== 'cancelado'
        );
        
        for (const apt of dayAppointments) {
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
    }
    
    async create(appointmentData) {
        const appointments = this.getAppointments();
        
        const newAppointment = {
            ...appointmentData,
            id: this.generateId(),
            criado_em: new Date().toISOString()
        };
        
        appointments.push(newAppointment);
        this.saveAppointments(appointments);
        
        return newAppointment;
    }
    
    async loadAll(dateFilter = null, statusFilter = null) {
        let appointments = this.getAppointments();
        
        // Aplicar filtros
        if (dateFilter) {
            if (dateFilter === 'today') {
                const today = TimeUtils.getTodayDate();
                appointments = appointments.filter(apt => apt.data === today);
            } else if (dateFilter === 'week') {
                const today = new Date();
                const weekStart = new Date(today.setDate(today.getDate() - today.getDay()));
                const weekEnd = new Date(today.setDate(today.getDate() - today.getDay() + 6));
                const startDate = weekStart.toISOString().split('T')[0];
                const endDate = weekEnd.toISOString().split('T')[0];
                appointments = appointments.filter(apt => apt.data >= startDate && apt.data <= endDate);
            }
        }
        
        if (statusFilter && statusFilter !== 'all') {
            appointments = appointments.filter(apt => apt.status === statusFilter);
        }
        
        // Ordenar por data e horário
        appointments.sort((a, b) => {
            const dateA = new Date(`${a.data}T${a.horario_inicio}`);
            const dateB = new Date(`${b.data}T${b.horario_inicio}`);
            return dateA - dateB;
        });
        
        return appointments;
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

// ===== SERVIÇO DE INADIMPLENTES =====
class UnpaidService extends BaseService {
    constructor(supabaseManager, cacheManager) {
        super(supabaseManager, cacheManager);
        this.storageKey = 'barbearia_inadimplentes';
        this.initializeStorage();
    }
    
    initializeStorage() {
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
        }
    }
    
    getUnpaidClients() {
        try {
            return JSON.parse(localStorage.getItem(this.storageKey)) || [];
        } catch (error) {
            console.error('Erro ao carregar inadimplentes:', error);
            return [];
        }
    }
    
    saveUnpaidClients(unpaidClients) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(unpaidClients));
        } catch (error) {
            console.error('Erro ao salvar inadimplentes:', error);
            throw error;
        }
    }
    
    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }
    
    async loadAll() {
        const unpaidClients = this.getUnpaidClients().filter(client => client.status === 'pendente');
        
        // Ordenar por data do serviço (mais recente primeiro)
        unpaidClients.sort((a, b) => new Date(b.data_servico) - new Date(a.data_servico));
        
        return unpaidClients;
    }
    
    async create(unpaidData) {
        const unpaidClients = this.getUnpaidClients();
        
        const newUnpaidClient = {
            ...unpaidData,
            id: this.generateId(),
            criado_em: new Date().toISOString(),
            status: 'pendente'
        };
        
        unpaidClients.push(newUnpaidClient);
        this.saveUnpaidClients(unpaidClients);
        
        return newUnpaidClient;
    }
    
    async markAsPaid(id) {
        const unpaidClients = this.getUnpaidClients();
        const clientIndex = unpaidClients.findIndex(client => client.id === id);
        
        if (clientIndex === -1) {
            throw new Error('Inadimplente não encontrado');
        }
        
        unpaidClients[clientIndex].status = 'pago';
        unpaidClients[clientIndex].data_pagamento = new Date().toISOString();
        
        this.saveUnpaidClients(unpaidClients);
        
        return unpaidClients[clientIndex];
    }
    
    async delete(id) {
        const unpaidClients = this.getUnpaidClients();
        const filteredClients = unpaidClients.filter(client => client.id !== id);
        
        this.saveUnpaidClients(filteredClients);
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
        this.unpaidService = new UnpaidService(this.supabaseManager, this.cacheManager);
        
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
            
            // Criar dados de exemplo se não existirem
            await this.createSampleDataIfNeeded();
            
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
    
    async createSampleDataIfNeeded() {
        // Verificar se já existem dados
        const existingClients = this.clientService.getClients();
        const existingAppointments = this.appointmentService.getAppointments();
        
        if (existingClients.length === 0) {
            // Criar clientes de exemplo
            await this.clientService.create({
                nome: 'João Silva',
                telefone: '11987654321',
                email: 'joao@email.com',
                endereco: 'Rua das Flores, 123',
                observacoes: 'Cliente preferencial',
                status_cliente: 'ativo'
            });
            
            await this.clientService.create({
                nome: 'Maria Santos',
                telefone: '11876543210',
                email: 'maria@email.com',
                endereco: 'Av. Principal, 456',
                observacoes: '',
                status_cliente: 'ativo'
            });
        }
        
        if (existingAppointments.length === 0) {
            // Criar agendamentos de exemplo para hoje
            const today = TimeUtils.getTodayDate();
            
            await this.appointmentService.create({
                cliente_nome: 'João Silva',
                cliente_telefone: '11987654321',
                servico: 'Corte + Barba',
                data: today,
                horario_inicio: '09:00',
                horario_fim: '10:00',
                valor: 35.00,
                status: 'agendado',
                observacoes: 'Corte degradê'
            });
            
            await this.appointmentService.create({
                cliente_nome: 'Maria Santos',
                cliente_telefone: '11876543210',
                servico: 'Corte Feminino',
                data: today,
                horario_inicio: '14:30',
                horario_fim: '15:30',
                valor: 40.00,
                status: 'agendado',
                observacoes: 'Corte em camadas'
            });
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
        
        // Schedule date change
        const scheduleDate = document.getElementById('scheduleDate');
        if (scheduleDate) {
            scheduleDate.addEventListener('change', () => this.loadScheduleGrid());
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
        try {
            // Inicializar data se não estiver definida
            const scheduleDateInput = document.getElementById('scheduleDate');
            if (scheduleDateInput && !scheduleDateInput.value) {
                scheduleDateInput.value = TimeUtils.getTodayDate();
            }
            
            const scheduleDate = scheduleDateInput?.value || TimeUtils.getTodayDate();
            const scheduleContainer = document.querySelector('.schedule-container');
            
            if (!scheduleContainer) return;
            
            // Gerar grade de horários
            const timeSlots = this.generateTimeSlots();
            const occupiedSlots = await this.getOccupiedSlots(scheduleDate);
            
            scheduleContainer.innerHTML = this.renderScheduleGrid(timeSlots, occupiedSlots);
            
        } catch (error) {
            console.error('Erro ao carregar grade de horários:', error);
            this.uiManager.showError('Erro ao carregar grade de horários');
        }
    }
    
    generateTimeSlots() {
        const slots = [];
        const startHour = 8; // 8:00
        const endHour = 18; // 18:00
        
        for (let hour = startHour; hour < endHour; hour++) {
            for (let minute = 0; minute < 60; minute += 30) {
                const timeSlot = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
                slots.push(timeSlot);
            }
        }
        
        return slots;
    }
    
    async getOccupiedSlots(date) {
        try {
            if (!this.appointments || this.appointments.length === 0) {
                await this.loadAppointments();
            }
            
            const dayAppointments = this.appointments.filter(apt => 
                apt.data === date && apt.status !== 'cancelado'
            );
            
            const occupiedSlots = [];
            dayAppointments.forEach(apt => {
                const slots = TimeUtils.getOccupiedTimeSlots(apt.horario_inicio, apt.horario_fim);
                occupiedSlots.push(...slots);
            });
            
            return occupiedSlots;
        } catch (error) {
            console.error('Erro ao obter slots ocupados:', error);
            return [];
        }
    }
    
    renderScheduleGrid(timeSlots, occupiedSlots) {
        return `
            <div class="schedule-grid">
                <div class="schedule-header">
                    <h4>Horários Disponíveis</h4>
                    <div class="schedule-legend">
                        <span class="legend-item">
                            <span class="legend-color available"></span>
                            Disponível
                        </span>
                        <span class="legend-item">
                            <span class="legend-color occupied"></span>
                            Ocupado
                        </span>
                    </div>
                </div>
                <div class="time-slots">
                    ${timeSlots.map(slot => {
                        const isOccupied = occupiedSlots.includes(slot);
                        return `
                            <div class="time-slot ${isOccupied ? 'occupied' : 'available'}" 
                                 data-time="${slot}">
                                ${slot}
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
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
        try {
            console.log('Carregando clientes inadimplentes...');
            
            if (!this.unpaidService) {
                console.error('Serviço de inadimplentes não disponível');
                return;
            }
            
            const unpaidClients = await this.unpaidService.loadAll();
            this.renderUnpaidClients(unpaidClients);
            
        } catch (error) {
            console.error('Erro ao carregar inadimplentes:', error);
            this.uiManager.showNotification('Erro ao carregar inadimplentes', 'error');
        }
    }
    
    renderUnpaidClients(unpaidClients = []) {
        const tbody = document.querySelector('#unpaidTable tbody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (unpaidClients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center">Nenhum inadimplente encontrado</td></tr>';
            return;
        }
        
        unpaidClients.forEach(unpaid => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${unpaid.nome_cliente}</td>
                <td>${PhoneUtils.formatForDisplay(unpaid.telefone_cliente)}</td>
                <td>${unpaid.servico}</td>
                <td>R$ ${parseFloat(unpaid.valor).toFixed(2)}</td>
                <td>${TimeUtils.formatDate(unpaid.data_servico)}</td>
                <td class="action-buttons">
                    <button class="action-btn paid-btn" onclick="markUnpaidAsPaid('${unpaid.id}')">
                        Marcar como Pago
                    </button>
                    <button class="action-btn delete-btn" onclick="deleteUnpaid('${unpaid.id}')">
                        Excluir
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });
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

window.openAddClientModal = () => {
    const modal = document.getElementById('addClientModal');
    if (modal) {
        modal.style.display = 'block';
        // Limpar formulário
        const form = document.getElementById('addClientForm');
        if (form) form.reset();
    }
};

window.closeAddClientModal = () => {
    const modal = document.getElementById('addClientModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.addClient = async () => {
    try {
        const nome = document.getElementById('addClientNome')?.value;
        const telefone = document.getElementById('addClientTelefone')?.value;
        const email = document.getElementById('addClientEmail')?.value;
        const endereco = document.getElementById('addClientEndereco')?.value;
        const observacoes = document.getElementById('addClientObservacoes')?.value;

        if (!nome || !telefone) {
            alert('Nome e telefone são obrigatórios!');
            return;
        }

        if (!ValidationUtils.isValidPhone(telefone)) {
            alert('Telefone inválido!');
            return;
        }

        const clientData = {
            nome: nome.trim(),
            telefone: PhoneUtils.normalize(telefone),
            email: email?.trim() || '',
            endereco: endereco?.trim() || '',
            observacoes: observacoes?.trim() || '',
            status_cliente: 'ativo'
        };

        if (app && app.clientService) {
            await app.clientService.create(clientData);
            window.closeAddClientModal();
            app.uiManager.showNotification('Cliente adicionado com sucesso!', 'success');
            
            // Recarregar dados se estiver na seção de clientes
            if (app.uiManager.currentSection === 'clients') {
                await app.loadClients();
            }
        } else {
            throw new Error('Serviço de clientes não disponível');
        }
    } catch (error) {
        console.error('Erro ao adicionar cliente:', error);
        alert('Erro ao adicionar cliente: ' + error.message);
    }
};

window.openEditClientModal = (clientId) => {
    const modal = document.getElementById('editClientModal');
    if (modal && app) {
        const client = app.cacheManager.getClient(clientId);
        if (client) {
            // Preencher formulário com dados do cliente
            document.getElementById('editClientId').value = client.id;
            document.getElementById('editClientNome').value = client.nome;
            document.getElementById('editClientTelefone').value = client.telefone;
            document.getElementById('editClientEmail').value = client.email || '';
            document.getElementById('editClientEndereco').value = client.endereco || '';
            document.getElementById('editClientObservacoes').value = client.observacoes || '';
            
            modal.style.display = 'block';
        }
    }
};

window.closeEditClientModal = () => {
    const modal = document.getElementById('editClientModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.updateClient = async () => {
    try {
        const id = document.getElementById('editClientId')?.value;
        const nome = document.getElementById('editClientNome')?.value;
        const telefone = document.getElementById('editClientTelefone')?.value;
        const email = document.getElementById('editClientEmail')?.value;
        const endereco = document.getElementById('editClientEndereco')?.value;
        const observacoes = document.getElementById('editClientObservacoes')?.value;

        if (!nome || !telefone) {
            alert('Nome e telefone são obrigatórios!');
            return;
        }

        if (!ValidationUtils.isValidPhone(telefone)) {
            alert('Telefone inválido!');
            return;
        }

        const clientData = {
            nome: nome.trim(),
            telefone: PhoneUtils.normalize(telefone),
            email: email?.trim() || '',
            endereco: endereco?.trim() || '',
            observacoes: observacoes?.trim() || ''
        };

        if (app && app.clientService) {
            await app.clientService.update(parseInt(id), clientData);
            window.closeEditClientModal();
            app.uiManager.showNotification('Cliente atualizado com sucesso!', 'success');
            
            // Recarregar dados se estiver na seção de clientes
            if (app.uiManager.currentSection === 'clients') {
                await app.loadClients();
            }
        } else {
            throw new Error('Serviço de clientes não disponível');
        }
    } catch (error) {
        console.error('Erro ao atualizar cliente:', error);
        alert('Erro ao atualizar cliente: ' + error.message);
    }
};

window.deleteClient = async (clientId) => {
    if (confirm('Tem certeza que deseja excluir este cliente?')) {
        try {
            if (app && app.clientService) {
                await app.clientService.delete(clientId);
                app.uiManager.showNotification('Cliente excluído com sucesso!', 'success');
                
                // Recarregar dados se estiver na seção de clientes
                if (app.uiManager.currentSection === 'clients') {
                    await app.loadClients();
                }
            } else {
                throw new Error('Serviço de clientes não disponível');
            }
        } catch (error) {
            console.error('Erro ao excluir cliente:', error);
            alert('Erro ao excluir cliente: ' + error.message);
        }
    }
};
window.contactClientDirect = (phone, name) => {
    const normalizedPhone = PhoneUtils.normalize(phone);
    const message = `Olá ${name}! Como está? Aqui é da Barbearia do Jão. Esperamos vê-lo em breve!`;
    const whatsappUrl = `https://wa.me/55${normalizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
};

// Funções de agendamentos para compatibilidade
window.openAddAppointmentModal = () => {
    console.log('Abrindo modal de adicionar agendamento...');
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.style.display = 'block';
        // Limpar formulário
        const form = document.getElementById('addForm');
        if (form) form.reset();
        // Definir data padrão como hoje
        const dateInput = document.getElementById('addData');
        if (dateInput) dateInput.value = TimeUtils.getTodayDate();
        // Definir horário padrão
        const timeInput = document.getElementById('addHorarioInicio');
        if (timeInput && !timeInput.value) {
            const now = new Date();
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            timeInput.value = `${hours}:${minutes}`;
        }
    } else {
        console.error('Modal de agendamento não encontrado');
        alert('Modal de agendamento não encontrado. Verifique se o HTML está correto.');
    }
};

window.closeAddAppointmentModal = () => {
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Função para compatibilidade com o HTML existente
window.closeAddModal = () => window.closeAddAppointmentModal();

window.addAppointment = async () => {
    try {
        // Obter dados diretamente dos inputs
        const clienteNome = document.getElementById('addNome')?.value;
        const clienteTelefone = document.getElementById('addTelefone')?.value;
        const servico = document.getElementById('addServico')?.value;
        const data = document.getElementById('addData')?.value;
        const horarioInicio = document.getElementById('addHorarioInicio')?.value;
        const horarioFim = document.getElementById('addHorarioFim')?.value;
        const preco = document.getElementById('addPreco')?.value;
        const status = document.getElementById('addStatus')?.value || 'agendado';
        const formaPagamento = document.getElementById('addFormaPagamento')?.value;
        const pagamento = document.getElementById('addPagamento')?.value;
        const observacoes = document.getElementById('addObservacoes')?.value || '';

        const appointmentData = {
            cliente_nome: clienteNome,
            cliente_telefone: PhoneUtils.normalize(clienteTelefone),
            servico: servico,
            data: data,
            horario_inicio: horarioInicio,
            horario_fim: horarioFim,
            preco: parseFloat(preco) || 0,
            status: status,
            forma_pagamento: formaPagamento,
            pagamento: pagamento,
            observacoes: observacoes
        };

        // Validações básicas
        if (!appointmentData.cliente_nome || !appointmentData.cliente_telefone || 
            !appointmentData.servico || !appointmentData.data || !appointmentData.horario_inicio) {
            throw new Error('Todos os campos obrigatórios devem ser preenchidos');
        }

        if (!ValidationUtils.isValidPhone(appointmentData.cliente_telefone)) {
            throw new Error('Telefone inválido');
        }

        // Adicionar agendamento via serviço
        if (app && app.appointmentService) {
            await app.appointmentService.create(appointmentData);
            window.closeAddAppointmentModal();
            app.uiManager.showNotification('Agendamento criado com sucesso!', 'success');
            
            // Recarregar dados se estiver na seção de agendamentos
            if (app.uiManager.currentSection === 'appointments') {
                await app.loadAppointments();
            }
        } else {
            throw new Error('Serviço de agendamentos não disponível');
        }

    } catch (error) {
        console.error('Erro ao adicionar agendamento:', error);
        alert('Erro ao adicionar agendamento: ' + error.message);
    }
};

// Função chamada pelo formulário HTML
window.addNewAppointment = async (event) => {
    event.preventDefault();
    await window.addAppointment();
};

// Função para atualizar preço do serviço
window.updateServicePrice = () => {
    const servicoSelect = document.getElementById('addServico');
    const precoInput = document.getElementById('addPreco');
    
    if (servicoSelect && precoInput) {
        const selectedOption = servicoSelect.options[servicoSelect.selectedIndex];
        const price = selectedOption.getAttribute('data-price');
        if (price) {
            precoInput.value = price;
        }
    }
};

window.loadAppointments = () => app?.loadAppointments();
window.openEditAppointmentModal = (id) => console.log('openEditAppointmentModal - implementar para ID:', id);
window.closeEditAppointmentModal = () => console.log('closeEditAppointmentModal - implementar');
window.updateAppointment = () => console.log('updateAppointment - implementar');
window.deleteAppointment = (id) => console.log('deleteAppointment - implementar para ID:', id);
window.markAppointmentCompleted = (id) => console.log('markAppointmentCompleted - implementar para ID:', id);

// Funções de inadimplentes para compatibilidade
window.loadUnpaidClients = () => app?.loadUnpaidClients();

window.openAddUnpaidModal = () => {
    const modal = document.getElementById('addUnpaidModal');
    if (modal) {
        modal.style.display = 'block';
        // Limpar formulário
        const form = document.getElementById('addUnpaidForm');
        if (form) form.reset();
    }
};

window.closeAddUnpaidModal = () => {
    const modal = document.getElementById('addUnpaidModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

window.addUnpaidClient = async () => {
    try {
        const nome = document.getElementById('addUnpaidNome')?.value;
        const telefone = document.getElementById('addUnpaidTelefone')?.value;
        const servico = document.getElementById('addUnpaidServico')?.value;
        const valor = document.getElementById('addUnpaidValor')?.value;
        const data = document.getElementById('addUnpaidData')?.value;
        const observacoes = document.getElementById('addUnpaidObservacoes')?.value;

        if (!nome || !telefone || !servico || !valor || !data) {
            alert('Todos os campos obrigatórios devem ser preenchidos!');
            return;
        }

        if (!ValidationUtils.isValidPhone(telefone)) {
            alert('Telefone inválido!');
            return;
        }

        const unpaidData = {
            nome: nome.trim(),
            telefone: PhoneUtils.normalize(telefone),
            servico: servico.trim(),
            valor: parseFloat(valor),
            data_servico: data,
            observacoes: observacoes?.trim() || '',
            status: 'pendente'
        };

        if (app && app.unpaidService) {
            await app.unpaidService.create(unpaidData);
            window.closeAddUnpaidModal();
            app.uiManager.showNotification('Inadimplente adicionado com sucesso!', 'success');
            
            // Recarregar dados se estiver na seção de inadimplentes
            if (app.uiManager.currentSection === 'unpaid') {
                await app.loadUnpaidClients();
            }
        } else {
            throw new Error('Serviço de inadimplentes não disponível');
        }
    } catch (error) {
        console.error('Erro ao adicionar inadimplente:', error);
        alert('Erro ao adicionar inadimplente: ' + error.message);
    }
};

window.markAsPaid = async (unpaidId) => {
    if (confirm('Marcar como pago?')) {
        try {
            if (app && app.unpaidService) {
                await app.unpaidService.markAsPaid(unpaidId);
                app.uiManager.showNotification('Marcado como pago!', 'success');
                
                // Recarregar dados se estiver na seção de inadimplentes
                if (app.uiManager.currentSection === 'unpaid') {
                    await app.loadUnpaidClients();
                }
            } else {
                throw new Error('Serviço de inadimplentes não disponível');
            }
        } catch (error) {
            console.error('Erro ao marcar como pago:', error);
            alert('Erro ao marcar como pago: ' + error.message);
        }
    }
};

window.deleteUnpaidClient = async (unpaidId) => {
    if (confirm('Tem certeza que deseja excluir este registro?')) {
        try {
            if (app && app.unpaidService) {
                await app.unpaidService.delete(unpaidId);
                app.uiManager.showNotification('Registro excluído com sucesso!', 'success');
                
                // Recarregar dados se estiver na seção de inadimplentes
                if (app.uiManager.currentSection === 'unpaid') {
                    await app.loadUnpaidClients();
                }
            } else {
                throw new Error('Serviço de inadimplentes não disponível');
            }
        } catch (error) {
            console.error('Erro ao excluir inadimplente:', error);
            alert('Erro ao excluir inadimplente: ' + error.message);
        }
    }
};

window.contactClient = () => console.log('contactClient - implementar');
window.updateUnpaidServicePrice = () => {
    const servicoSelect = document.getElementById('addUnpaidServico');
    const valorInput = document.getElementById('addUnpaidValor');
    
    if (servicoSelect && valorInput && app && app.services) {
        const selectedServiceId = servicoSelect.value;
        const service = app.services.find(s => s.id == selectedServiceId);
        
        if (service) {
            valorInput.value = parseFloat(service.preco).toFixed(2);
        }
    }
};

console.log('✅ Sistema da Barbearia do Jão carregado com arquitetura orientada a objetos!');