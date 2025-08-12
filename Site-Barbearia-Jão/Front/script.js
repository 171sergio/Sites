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
        
        // Se já está no formato HH:MM
        if (timeString.match(/^\d{2}:\d{2}$/)) {
            return timeString;
        }
        
        // Se é um timestamp
        if (timeString.includes('T')) {
            const time = new Date(timeString);
            return time.toLocaleTimeString('pt-BR', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
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
}

// ===== GERENCIADORES DE SISTEMA =====
class CacheManager {
    constructor() {
        this.cache = new Map();
        this.ttl = Config.CACHE_TTL;
    }
    
    set(key, data, customTtl = null) {
        const ttl = customTtl || this.ttl;
        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }
    
    get(key) {
        const cached = this.cache.get(key);
        if (!cached) return null;
        
        if (Date.now() - cached.timestamp > cached.ttl) {
            this.cache.delete(key);
            return null;
        }
        
        return cached.data;
    }
    
    has(key) {
        return this.get(key) !== null;
    }
    
    delete(key) {
        this.cache.delete(key);
    }
    
    clearCache() {
        this.cache.clear();
    }
    
    // Métodos específicos para diferentes tipos de dados
    setClient(id, client) {
        this.set(`client_${id}`, client);
    }
    
    getClient(id) {
        return this.get(`client_${id}`);
    }
    
    setService(id, service) {
        this.set(`service_${id}`, service);
    }
    
    getService(id) {
        return this.get(`service_${id}`);
    }
    
    setAppointment(id, appointment) {
        this.set(`appointment_${id}`, appointment);
    }
    
    getAppointment(id) {
        return this.get(`appointment_${id}`);
    }
}

class SupabaseManager {
    constructor() {
        this.client = null;
        this.isConnected = false;
    }
    
    isAvailable() {
        return this.client && this.isConnected;
    }
    
    async testConnection() {
        if (!this.client) return false;
        
        try {
            const { data, error } = await this.client
                .from('clientes')
                .select('id')
                .limit(1);
            
            this.isConnected = !error;
            return this.isConnected;
        } catch (error) {
            this.isConnected = false;
            return false;
        }
    }
}

class AuthManager {
    constructor() {
        this.currentUser = null;
        this.sessionKey = 'barbearia_session';
    }
    
    login(username, password) {
        if (username === Config.VALID_CREDENTIALS.username && 
            password === Config.VALID_CREDENTIALS.password) {
            
            this.currentUser = { username, loginTime: new Date().toISOString() };
            localStorage.setItem(this.sessionKey, JSON.stringify(this.currentUser));
            return true;
        }
        return false;
    }
    
    logout() {
        this.currentUser = null;
        localStorage.removeItem(this.sessionKey);
    }
    
    isAuthenticated() {
        if (this.currentUser) return true;
        
        const session = localStorage.getItem(this.sessionKey);
        if (session) {
            this.currentUser = JSON.parse(session);
            return true;
        }
        
        return false;
    }
    
    getCurrentUser() {
        return this.currentUser;
    }
}

class UIManager {
    constructor() {
        this.currentSection = 'overview';
        this.loginForm = document.getElementById('loginForm');
    }
    
    showLogin() {
        const loginScreen = document.getElementById('loginScreen');
        const dashboard = document.getElementById('dashboard');
        
        if (loginScreen) loginScreen.style.display = 'flex';
        if (dashboard) dashboard.style.display = 'none';
    }
    
    showDashboard(user) {
        const loginScreen = document.getElementById('loginScreen');
        const dashboard = document.getElementById('dashboard');
        const userNameSpan = document.getElementById('userName');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (dashboard) dashboard.style.display = 'block';
        if (userNameSpan) userNameSpan.textContent = user.username;
        
        this.showSection('overview');
    }
    
    showSection(sectionId) {
        // Esconder todas as seções
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        
        // Mostrar seção selecionada
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.add('active');
        }
        
        // Atualizar navegação
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeNavItem = document.querySelector(`[data-section="${sectionId}"]`);
        if (activeNavItem) {
            activeNavItem.classList.add('active');
        }
        
        this.currentSection = sectionId;
    }
    
    showLoading() {
        // Implementar indicador de carregamento
        console.log('Carregando...');
    }
    
    hideLoading() {
        // Esconder indicador de carregamento
        console.log('Carregamento concluído');
    }
    
    showError(message) {
        const errorElement = document.getElementById('loginError');
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
            
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        } else {
            alert(message);
        }
    }
    
    showNotification(message, type = 'info') {
        // Implementar sistema de notificações
        console.log(`${type.toUpperCase()}: ${message}`);
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

// ===== SERVIÇOS DE DADOS =====
class BaseService {
    constructor(supabaseManager, cacheManager) {
        this.supabase = supabaseManager;
        this.cache = cacheManager;
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
    
    async create(clientData) {
        const clients = this.getClients();
        
        // Verificar se já existe cliente com mesmo telefone
        const normalizedPhone = PhoneUtils.normalize(clientData.telefone);
        const existingClient = clients.find(client => 
            PhoneUtils.areEqual(client.telefone, normalizedPhone)
        );
        
        if (existingClient) {
            throw new Error('Já existe um cliente com este telefone');
        }
        
        const newClient = {
            ...clientData,
            id: this.generateId(),
            telefone: normalizedPhone,
            criado_em: new Date().toISOString()
        };
        
        clients.push(newClient);
        this.saveClients(clients);
        this.cache.setClient(newClient.id, newClient);
        
        return newClient;
    }
    
    async loadAll() {
        return this.getClients();
    }
    
    async findByPhone(phone) {
        const clients = this.getClients();
        const normalizedPhone = PhoneUtils.normalize(phone);
        
        return clients.find(client => 
            PhoneUtils.areEqual(client.telefone, normalizedPhone)
        );
    }
    
    async update(id, updateData) {
        const clients = this.getClients();
        const clientIndex = clients.findIndex(client => client.id === id);
        
        if (clientIndex === -1) {
            throw new Error('Cliente não encontrado');
        }
        
        clients[clientIndex] = { ...clients[clientIndex], ...updateData };
        this.saveClients(clients);
        this.cache.setClient(id, clients[clientIndex]);
        
        return clients[clientIndex];
    }
    
    async delete(id) {
        const clients = this.getClients();
        const filteredClients = clients.filter(client => client.id !== id);
        
        this.saveClients(filteredClients);
        this.cache.delete(`client_${id}`);
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
                { id: '1', nome: 'Corte Simples', preco: 25.00, duracao: 30, ativo: true },
                { id: '2', nome: 'Corte + Barba', preco: 35.00, duracao: 45, ativo: true },
                { id: '3', nome: 'Barba', preco: 15.00, duracao: 20, ativo: true },
                { id: '4', nome: 'Corte Feminino', preco: 40.00, duracao: 60, ativo: true }
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
        const services = this.getServices();
        
        // Cachear serviços
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
        this.cache.setAppointment(newAppointment.id, newAppointment);
        
        return newAppointment;
    }
    
    async loadAll(dateFilter = null, statusFilter = null) {
        let appointments = this.getAppointments();
        
        if (dateFilter) {
            appointments = appointments.filter(apt => apt.data === dateFilter);
        }
        
        if (statusFilter) {
            appointments = appointments.filter(apt => apt.status === statusFilter);
        }
        
        return appointments.sort((a, b) => {
            const dateA = new Date(`${a.data}T${a.horario_inicio}`);
            const dateB = new Date(`${b.data}T${b.horario_inicio}`);
            return dateA - dateB;
        });
    }
    
    async update(id, updateData) {
        const appointments = this.getAppointments();
        const appointmentIndex = appointments.findIndex(apt => apt.id === id);
        
        if (appointmentIndex === -1) {
            throw new Error('Agendamento não encontrado');
        }
        
        appointments[appointmentIndex] = { ...appointments[appointmentIndex], ...updateData };
        this.saveAppointments(appointments);
        this.cache.setAppointment(id, appointments[appointmentIndex]);
        
        return appointments[appointmentIndex];
    }
    
    async delete(id) {
        const appointments = this.getAppointments();
        const filteredAppointments = appointments.filter(apt => apt.id !== id);
        
        this.saveAppointments(filteredAppointments);
        this.cache.delete(`appointment_${id}`);
    }
}

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
    
    saveUnpaidClients(clients) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(clients));
        } catch (error) {
            console.error('Erro ao salvar inadimplentes:', error);
            throw error;
        }
    }
    
    generateId() {
        return Date.now() + Math.random().toString(36).substr(2, 9);
    }
    
    async create(unpaidData) {
        const unpaidClients = this.getUnpaidClients();
        
        const newUnpaidClient = {
            ...unpaidData,
            id: this.generateId(),
            criado_em: new Date().toISOString()
        };
        
        unpaidClients.push(newUnpaidClient);
        this.saveUnpaidClients(unpaidClients);
        
        return newUnpaidClient;
    }
    
    async loadAll() {
        return this.getUnpaidClients();
    }
    
    async markAsPaid(id, paymentMethod) {
        const unpaidClients = this.getUnpaidClients();
        const clientIndex = unpaidClients.findIndex(client => client.id === id);
        
        if (clientIndex === -1) {
            throw new Error('Cliente inadimplente não encontrado');
        }
        
        unpaidClients[clientIndex].forma_pagamento = paymentMethod;
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
            this.appointments = await this.appointmentService.loadAll(scheduleDate);
            this.renderScheduleGrid();
        } catch (error) {
            console.error('Erro ao carregar grade de horários:', error);
            this.uiManager.showError('Erro ao carregar grade de horários');
        }
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
            const unpaidClients = await this.unpaidService.loadAll();
            this.renderUnpaidClients(unpaidClients);
        } catch (error) {
            console.error('Erro ao carregar inadimplentes:', error);
            this.uiManager.showError('Erro ao carregar inadimplentes');
        }
    }
    
    filterClients() {
        const searchTerm = document.getElementById('clientSearch')?.value?.toLowerCase() || '';
        
        if (!searchTerm) {
            this.renderClients();
            return;
        }
        
        const filteredClients = this.clients.filter(client => 
            client.nome.toLowerCase().includes(searchTerm) ||
            client.telefone.includes(searchTerm) ||
            (client.email && client.email.toLowerCase().includes(searchTerm))
        );
        
        this.renderClients(filteredClients);
    }
    
    renderScheduleGrid() {
        console.log('Renderizando grade de horários...');
        // Implementar renderização da grade de horários
    }
    
    renderAppointments(appointments = this.appointments) {
        console.log('Renderizando agendamentos:', appointments.length);
        // Implementar renderização de agendamentos
    }
    
    renderClients(clients = this.clients) {
        console.log('Renderizando clientes:', clients.length);
        // Implementar renderização de clientes
    }
    
    renderUnpaidClients(unpaidClients) {
        console.log('Renderizando inadimplentes:', unpaidClients.length);
        // Implementar renderização de inadimplentes
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

// ===== FUNÇÕES DE AGENDAMENTO =====
window.addNewAppointment = async () => {
    try {
        // Prevenir múltiplas submissões
        const submitBtn = document.querySelector('#addModal .btn-primary');
        if (submitBtn) {
            if (submitBtn.disabled) return;
            submitBtn.disabled = true;
            const originalText = submitBtn.textContent;
            submitBtn.textContent = 'Salvando...';
            
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
            }, 2000);
        }

        // Capturar dados do formulário
        const clienteNome = document.getElementById('clienteNome')?.value?.trim();
        const clienteTelefone = document.getElementById('clienteTelefone')?.value?.trim();
        const servico = document.getElementById('servico')?.value;
        const data = document.getElementById('data')?.value;
        const horarioInicio = document.getElementById('horarioInicio')?.value;
        const horarioFim = document.getElementById('horarioFim')?.value;
        const preco = parseFloat(document.getElementById('preco')?.value) || 0;
        const observacoes = document.getElementById('observacoes')?.value?.trim() || '';

        // Validações
        if (!clienteNome) {
            alert('Nome do cliente é obrigatório!');
            return;
        }

        if (!clienteTelefone) {
            alert('Telefone do cliente é obrigatório!');
            return;
        }

        if (!ValidationUtils.isValidPhone(clienteTelefone)) {
            alert('Formato de telefone inválido!');
            return;
        }

        if (!servico) {
            alert('Serviço é obrigatório!');
            return;
        }

        if (!data) {
            alert('Data é obrigatória!');
            return;
        }

        if (!horarioInicio) {
            alert('Horário de início é obrigatório!');
            return;
        }

        if (!horarioFim) {
            alert('Horário de fim é obrigatório!');
            return;
        }

        if (preco <= 0) {
            alert('Preço deve ser maior que zero!');
            return;
        }

        // Verificar conflito de horário
        if (app && app.appointmentService) {
            const conflictCheck = await app.appointmentService.checkTimeConflict(
                data, horarioInicio, horarioFim
            );

            if (conflictCheck.conflict) {
                alert(`Conflito de horário! Já existe um agendamento neste horário para ${conflictCheck.conflictWith.nome_cliente || conflictCheck.conflictWith.cliente_nome}`);
                return;
            }
        }

        // Buscar ou criar cliente
        let cliente;
        if (app && app.clientService) {
            cliente = await app.clientService.findByPhone(clienteTelefone);
            
            if (!cliente) {
                cliente = await app.clientService.create({
                    nome: clienteNome,
                    telefone: PhoneUtils.normalize(clienteTelefone),
                    status_cliente: 'ativo'
                });
            }
        }

        // Buscar serviço
        let servicoObj;
        if (app && app.serviceService) {
            const services = await app.serviceService.loadAll();
            servicoObj = services.find(s => s.nome === servico);
        }

        // Criar agendamento
        const appointmentData = {
            cliente_nome: clienteNome,
            cliente_telefone: PhoneUtils.normalize(clienteTelefone),
            servico: servico,
            data: data,
            horario_inicio: horarioInicio,
            horario_fim: horarioFim,
            valor: preco,
            preco_cobrado: preco,
            status: 'agendado',
            observacoes: observacoes
        };

        if (app && app.appointmentService) {
            await app.appointmentService.create(appointmentData);
            
            // Fechar modal
            const modal = document.getElementById('addModal');
            if (modal) {
                modal.style.display = 'none';
            }
            
            // Limpar formulário
            const form = document.querySelector('#addModal form');
            if (form) {
                form.reset();
            }
            
            // Mostrar notificação
            app.uiManager.showNotification('Agendamento criado com sucesso!', 'success');
            
            // Recarregar dados da seção atual
            await app.loadSectionData(app.uiManager.currentSection);
        } else {
            throw new Error('Serviço de agendamentos não disponível');
        }

    } catch (error) {
        console.error('Erro ao criar agendamento:', error);
        alert('Erro ao criar agendamento: ' + error.message);
    }
};

// Função para abrir modal de agendamento
window.openAddModal = () => {
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.style.display = 'block';
        
        // Limpar formulário
        const form = document.querySelector('#addModal form');
        if (form) {
            form.reset();
        }
        
        // Definir data padrão como hoje
        const dataInput = document.getElementById('data');
        if (dataInput && !dataInput.value) {
            dataInput.value = TimeUtils.getTodayDate();
        }
    }
};

// Função para fechar modal de agendamento
window.closeAddModal = () => {
    const modal = document.getElementById('addModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Função para atualizar preço baseado no serviço selecionado
window.updateServicePrice = async () => {
    const servicoSelect = document.getElementById('servico');
    const precoInput = document.getElementById('preco');
    
    if (!servicoSelect || !precoInput) return;
    
    const servicoNome = servicoSelect.value;
    if (!servicoNome) {
        precoInput.value = '';
        return;
    }
    
    try {
        if (app && app.serviceService) {
            const services = await app.serviceService.loadAll();
            const servico = services.find(s => s.nome === servicoNome);
            
            if (servico) {
                precoInput.value = servico.preco.toFixed(2);
            }
        }
    } catch (error) {
        console.error('Erro ao atualizar preço:', error);
    }
};
