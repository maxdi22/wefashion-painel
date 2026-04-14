import { Request, Response } from 'express';
import os from 'os';
import { prisma } from '../lib/prisma';

export class DashboardController {
  public static async getHome(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Não autenticado' });
    }

    const { role, tenantId, email } = req.user;
    const section = (req.query.section as string) || 'dashboard';
    const isMock = !(global as any).isUsingRedis;

    // 1. Buscar dados do Tenant se o usuário for ADMIN_LOJA
    let tenant = null;
    if (tenantId) {
      tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });
    }

    // 2. Buscar status da instalação (se tiver tenant)
    let installation = null;
    let isConnected = false;
    if (tenant) {
      installation = await prisma.pluginInstallation.findFirst({
        where: { tenantId: tenant.id },
        orderBy: { lastConnectedAt: 'desc' }
      });
      isConnected = installation?.status === 'connected';
    }

    const healthData = {
      uptime: process.uptime(),
      memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      platform: os.platform(),
      nodeVersion: process.version
    };

    const isSuperAdmin = role === 'super_admin';

    // 2.5. Security Check para Seções Globais
    const superAdminSections = ['global_overview', 'tenants', 'observability', 'security', 'marketing'];
    if (!isSuperAdmin && superAdminSections.includes(section)) {
      return res.status(403).send('<h1>Acesso Negado</h1><p>Você não tem permissão para acessar esta seção.</p>');
    }

    // 3. Buscar Jobs Filtrados por Tenant
    const whereClause: any = isSuperAdmin ? {} : { tenantId: tenantId || 'none' };

    const recentJobs = await prisma.tryOnJob.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { logs: { orderBy: { createdAt: 'desc' }, take: 1 } }
    });

    let allTenants: any[] = [];
    if (isSuperAdmin && section === 'tenants') {
      allTenants = await prisma.tenant.findMany({
        orderBy: { createdAt: 'desc' }
      });
    }

    // 4. Buscar Métricas Reais para Analytics
    let analyticsData = {
      successRate: '0%',
      conversions: 0,
      dailyUsage: [] as { date: string, count: number }[]
    };

    if (section === 'analytics' || section === 'dashboard') {
      const totalJobs = await prisma.tryOnJob.count({ where: whereClause });
      const doneJobs = await prisma.tryOnJob.count({ 
        where: { ...whereClause, status: 'done' } 
      });
      
      analyticsData.successRate = totalJobs > 0 
        ? ((doneJobs / totalJobs) * 100).toFixed(1) + '%' 
        : '0%';

      analyticsData.conversions = await prisma.analytics.count({
        where: { ...whereClause, metric: 'conversion' }
      });

      // Dados para o gráfico (últimos 15 dias)
      const fifteenDaysAgo = new Date();
      fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);

      const usageStats = await prisma.tryOnJob.groupBy({
        by: ['createdAt'],
        where: {
          ...whereClause,
          createdAt: { gte: fifteenDaysAgo }
        },
        _count: true
      });

      // Agrupar por dia (JS side para simplicidade com SQLite/PG)
      const dailyMap: Record<string, number> = {};
      usageStats.forEach(stat => {
        const dateKey = stat.createdAt.toISOString().split('T')[0];
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + stat._count;
      });

      // Preencher gaps nos últimos 15 dias
      for (let i = 0; i < 15; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        analyticsData.dailyUsage.unshift({
          date: key.split('-').reverse().slice(0, 2).join('/'),
          count: dailyMap[key] || 0
        });
      }
    }

    try {
      // 5. Buscar Leads se for a seção CRM
      let leads: any[] = [];
      if (section === 'leads') {
          leads = await prisma.lead.findMany({
              where: { tenantId: tenantId || 'none' },
              orderBy: { createdAt: 'desc' },
              take: 100
          });
      }

      const html = `
<!DOCTYPE html>
<html class="light" lang="pt-br">
<head>
    <meta charset="utf-8"/>
    <meta content="width=device-width, initial-scale=1.0" name="viewport"/>
    <title>WeFashion | Digital Atelier Dashboard</title>
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <link href="https://fonts.googleapis.com" rel="preconnect"/>
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
    <script id="tailwind-config">
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              "colors": {
                      "on-primary-container": "#525151",
                      "on-secondary-container": "#515252",
                      "surface": "#f9f9f9",
                      "tertiary-container": "#deddf9",
                      "inverse-primary": "#ffffff",
                      "primary-fixed": "#e5e2e1",
                      "surface-container-low": "#f2f4f4",
                      "surface-container": "#ebeeef",
                      "error-container": "#ff8b9a",
                      "on-secondary": "#faf8f8",
                      "primary-container": "#e5e2e1",
                      "tertiary-fixed": "#deddf9",
                      "on-background": "#2d3435",
                      "surface-bright": "#f9f9f9",
                      "on-surface-variant": "#5a6061",
                      "surface-tint": "#5f5e5e",
                      "primary-fixed-dim": "#d6d4d3",
                      "secondary-container": "#e3e2e2",
                      "on-primary": "#faf7f6",
                      "inverse-surface": "#0c0f0f",
                      "error-dim": "#4f0116",
                      "on-tertiary-fixed-variant": "#57586e",
                      "surface-container-lowest": "#ffffff",
                      "surface-dim": "#d4dbdd",
                      "on-secondary-fixed-variant": "#5b5b5c",
                      "on-error": "#fff7f7",
                      "on-secondary-fixed": "#3f3f3f",
                      "surface-container-highest": "#dde4e5",
                      "secondary-dim": "#535353",
                      "tertiary": "#5c5d74",
                      "primary-dim": "#535252",
                      "secondary-fixed": "#e3e2e2",
                      "on-surface": "#2d3435",
                      "tertiary-fixed-dim": "#d0cfea",
                      "on-primary-fixed": "#403f3f",
                      "on-primary-fixed-variant": "#5c5b5b",
                      "tertiary-dim": "#505168",
                      "error": "#9e3f4e",
                      "background": "#f9f9f9",
                      "on-tertiary-container": "#4d4e64",
                      "on-error-container": "#782232",
                      "outline": "#757c7d",
                      "outline-variant": "#adb3b4",
                      "surface-container-high": "#e4e9ea",
                      "on-tertiary-fixed": "#3b3c51",
                      "secondary": "#5f5f5f",
                      "on-tertiary": "#fbf8ff",
                      "inverse-on-surface": "#9c9d9d",
                      "primary": "#5f5e5e",
                      "secondary-fixed-dim": "#d5d4d4",
                      "surface-variant": "#dde4e5"
              },
              "borderRadius": {
                      "DEFAULT": "0.25rem",
                      "lg": "0.5rem",
                      "xl": "0.75rem",
                      "full": "9999px"
              },
              "fontFamily": {
                      "headline": ["Plus Jakarta Sans"],
                      "body": ["Inter"],
                      "label": ["Inter"]
              }
            },
          },
        }
    </script>
    <style>
        .material-symbols-outlined {
            font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
        }
        .ease-out-expo {
            transition-timing-function: cubic-bezier(0.19, 1, 0.22, 1);
        }
        .hide-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .hide-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
    </style>
</head>
<body class="bg-surface font-body text-on-surface">
    <!-- SideNavBar Shell -->
    <aside class="fixed left-0 top-0 h-full flex flex-col py-8 bg-white dark:bg-neutral-900 h-screen w-64 border-r-0 z-50">
        <div class="px-8 mb-12">
            <h1 class="text-xl font-bold tracking-tighter text-[#1A1A1A] dark:text-white font-headline">WeFashion</h1>
            <p class="text-[10px] uppercase tracking-[0.2em] text-[#5F5E5E] dark:text-neutral-400 mt-1">Digital Atelier</p>
        </div>
        <nav class="flex-1 space-y-2">
            <!-- Active Tab: Dashboard -->
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'dashboard' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=dashboard">
                <span class="material-symbols-outlined">dashboard</span> Dashboard
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'tryon' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=tryon">
                <span class="material-symbols-outlined">auto_awesome</span> Looks Gerados
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm text-[#5F5E5E] opacity-40 cursor-not-allowed" href="#">
                <span class="material-symbols-outlined">inventory_2</span> Produtos
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'analytics' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=analytics">
                <span class="material-symbols-outlined">insights</span> Analytics
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'leads' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=leads">
                <span class="material-symbols-outlined">person_search</span> Leads (CRM)
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'integration' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=integration">
                <span class="material-symbols-outlined">hub</span> Integração
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'billing' || section === 'plans' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=billing">
                <span class="material-symbols-outlined">receipt_long</span> Plano/Billing
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'settings' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=settings">
                <span class="material-symbols-outlined">settings</span> Configurações
            </a>

            ${isSuperAdmin ? `
            <div class="px-8 text-[10px] uppercase tracking-widest text-neutral-400 mt-8 mb-4 font-bold">Admin Scope</div>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'tenants' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=tenants">
                <span class="material-symbols-outlined">groups</span> Tenants
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'marketing' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=marketing">
                <span class="material-symbols-outlined">mail_lock</span> Central Marketing
            </a>
            <a class="flex items-center gap-4 py-2 pl-4 transition-colors duration-300 ease-out-expo font-headline tracking-tight text-sm ${section === 'observability' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#5F5E5E] bg-neutral-50' : 'text-[#5F5E5E] hover:text-[#1A1A1A] hover:bg-neutral-50'}" href="/?section=observability">
                <span class="material-symbols-outlined">query_stats</span> Observabilidade
            </a>
            ` : ''}
        </nav>
        
        <div class="px-8 mt-auto pt-8">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center font-bold text-primary italic shadow-inner">${email.charAt(0).toUpperCase()}</div>
                <div class="overflow-hidden">
                    <p class="text-sm font-semibold text-[#1A1A1A] truncate">${tenant?.name || 'Curadoria IA'}</p>
                    <p class="text-[10px] text-[#5F5E5E] truncate">${email}</p>
                </div>
            </div>
            <a href="/logout" class="block mt-6 text-[10px] font-black uppercase tracking-widest text-error hover:opacity-70 transition-all">Sair da Conta</a>
        </div>
    </aside>

    <!-- Main Canvas -->
    <main class="ml-64 min-h-screen">
        <!-- TopNavBar Shell -->
        <header class="flex justify-between items-center w-full px-8 h-16 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-xl sticky top-0 z-40 border-b border-surface-container">
            <div class="flex items-center gap-6">
                <div class="relative">
                    <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 text-lg">search</span>
                    <input class="bg-transparent border-none focus:ring-0 text-[10px] tracking-widest font-inter uppercase pl-10 w-64 placeholder-neutral-400" placeholder="BUSCAR LOOKS OU PRODUTOS..." type="text"/>
                </div>
            </div>
            <div class="flex items-center gap-6">
                <div class="flex gap-4">
                    <button class="opacity-70 hover:opacity-100 transition-all duration-300 ease-out">
                        <span class="material-symbols-outlined text-xl">notifications</span>
                    </button>
                    <button class="opacity-70 hover:opacity-100 transition-all duration-300 ease-out">
                        <span class="material-symbols-outlined text-xl">settings</span>
                    </button>
                </div>
                <div class="h-8 w-8 rounded-full overflow-hidden border border-surface-container">
                    <div class="w-full h-full bg-surface-container flex items-center justify-center text-[10px] font-bold text-primary uppercase">${role.charAt(0)}</div>
                </div>
            </div>
        </header>

        <!-- Content Area -->
        <div class="p-8 pb-20 max-w-[1400px] mx-auto">
            ${renderSection(section, isSuperAdmin, isMock, healthData, tenant, isConnected, installation, recentJobs, allTenants, email, leads)}
        </div>
    </main>
</body>
</html>
    `;

    function renderSection(s: string, admin: boolean, mock: boolean, health: any, t: any, connected: boolean, inst: any, jobs: any[], tenantsList: any[], userEmail: string, leadsList: any[]) {
        switch (s) {
            case 'dashboard':
                return `
                <!-- Hero Section: Impacto & Uso -->
                <section class="relative overflow-hidden rounded-[3rem] bg-white p-12 mb-12 shadow-sm border border-neutral-100 group">
                    <div class="absolute top-0 right-0 w-1/3 h-full bg-surface-container-low opacity-30 skew-x-12 translate-x-32 group-hover:translate-x-24 transition-transform duration-1000"></div>
                    
                    <div class="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <span class="text-[10px] uppercase tracking-[0.4em] text-tertiary mb-6 block font-black border-l-2 border-tertiary pl-4">Performance Inteligente</span>
                            <h2 class="text-5xl font-extrabold font-headline tracking-tighter text-[#1A1A1A] leading-tight mb-8 uppercase italic">
                                Elevando sua Marca <br/>com Realismo IA
                            </h2>
                            <div class="flex gap-12">
                                <div class="relative">
                                    <p class="text-4xl font-headline font-black text-[#1A1A1A] italic leading-none">R$ ${(analyticsData.conversions * 149).toLocaleString('pt-BR')}</p>
                                    <p class="text-[9px] text-neutral-400 uppercase tracking-widest font-black mt-2">Vendas Assistidas</p>
                                </div>
                                <div class="w-px h-12 bg-neutral-100"></div>
                                <div class="relative">
                                    <p class="text-4xl font-headline font-black text-tertiary italic leading-none">+${(parseFloat(analyticsData.successRate) / 4).toFixed(1)}%</p>
                                    <p class="text-[9px] text-neutral-400 uppercase tracking-widest font-black mt-2">Conversão Real</p>
                                </div>
                            </div>
                        </div>

                        <!-- Usage Summary Card -->
                        <div class="bg-surface p-8 rounded-[2rem] border border-neutral-100 shadow-inner">
                            <div class="flex justify-between items-center mb-6">
                                <p class="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A]">Status do Provador</p>
                                <span class="px-3 py-1 bg-success/10 text-success text-[8px] font-black uppercase tracking-widest rounded-full">Sistema Online</span>
                            </div>
                            
                            <div class="mb-6">
                                <div class="flex justify-between items-end mb-2">
                                    <p class="text-[9px] text-neutral-400 uppercase font-black">Consumo Mensal</p>
                                    <p class="text-xs font-black italic tracking-tighter">${t?.proofsUsedThisMonth || 0} / ${t?.proofsMonthlyLimit || 0} <span class="text-[8px] uppercase text-neutral-300 font-bold not-italic">provas</span></p>
                                </div>
                                <div class="w-full h-2 bg-white rounded-full overflow-hidden p-0.5 border border-neutral-50 shadow-sm">
                                    <div class="h-full rounded-full bg-gradient-to-r from-primary to-primary-dim transition-all duration-1000" style="width: ${Math.min(100, Math.round(((t?.proofsUsedThisMonth || 0) / (t?.proofsMonthlyLimit || 1)) * 100))}%"></div>
                                </div>
                            </div>

                            <div class="flex justify-between items-center bg-white p-4 rounded-xl border border-neutral-50 shadow-sm">
                                <div>
                                    <p class="text-xl font-headline font-black italic text-[#1A1A1A] leading-none">${t?.proofsBalance || 0}</p>
                                    <p class="text-[8px] uppercase tracking-widest font-bold text-neutral-400">Saldo Atual</p>
                                </div>
                                <a href="/?section=billing" class="px-4 py-2 bg-surface text-[9px] font-black uppercase tracking-widest border border-neutral-100 rounded-lg hover:bg-[#1A1A1A] hover:text-white transition-all">Recarregar</a>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- Galeria de Looks Recentes -->
                <section class="mb-12">
                    <div class="flex justify-between items-end mb-8">
                        <div>
                            <h3 class="text-2xl font-black font-headline tracking-tighter uppercase italic leading-none">Galeria de Looks Recentes</h3>
                            <p class="text-xs text-neutral-500 font-bold uppercase tracking-widest mt-2">Composições criadas pela IA nas últimas 24h</p>
                        </div>
                        <a href="/?section=tryon" class="text-[10px] font-black tracking-widest uppercase text-tertiary border-b-2 border-tertiary/20 pb-1 hover:border-tertiary transition-all">Ver Galeria Completa</a>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
                        ${jobs.slice(0, 4).map(j => `
                            <div class="group relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-container-low border border-surface-container">
                                <img alt="Look" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="${j.resultImageUrl || j.inputPersonUrl}"/>
                                <div class="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6">
                                    <p class="text-white text-xs font-black uppercase tracking-widest">Look ${j.productType || 'Fashion'}</p>
                                    <p class="text-white/70 text-[10px] uppercase font-bold tracking-widest mt-1">ID: #WF-${j.id.slice(-4).toUpperCase()}</p>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </section>

                <section class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div class="lg:col-span-1 space-y-6">
                        <h3 class="text-lg font-black font-headline tracking-tighter uppercase italic mb-8">Funil de Conversão</h3>
                        <div class="space-y-4">
                            <div class="bg-surface-container-low p-4 rounded-lg border border-surface-container">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-[10px] uppercase tracking-widest font-black text-neutral-400">Visualizações</span>
                                    <span class="text-sm font-black">45.2k</span>
                                </div>
                                <div class="w-full bg-surface-container rounded-full h-1">
                                    <div class="bg-[#1A1A1A] h-1 rounded-full w-full"></div>
                                </div>
                            </div>
                            <div class="bg-surface-container-low p-4 rounded-lg ml-4 border border-surface-container">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-[10px] uppercase tracking-widest font-black text-neutral-400">Uso do Provador</span>
                                    <span class="text-sm font-black">${analyticsData.dailyUsage.reduce((acc, curr) => acc + curr.count, 0)}</span>
                                </div>
                                <div class="w-full bg-surface-container rounded-full h-1">
                                    <div class="bg-[#1A1A1A] h-1 rounded-full w-[28%]"></div>
                                </div>
                            </div>
                            <div class="bg-surface-container-low p-4 rounded-lg ml-8 border border-surface-container border-tertiary/20">
                                <div class="flex justify-between items-center mb-2">
                                    <span class="text-[10px] uppercase tracking-widest font-black text-tertiary">Purchases</span>
                                    <span class="text-sm font-black text-tertiary">${analyticsData.conversions}</span>
                                </div>
                                <div class="w-full bg-tertiary/20 rounded-full h-1">
                                    <div class="bg-tertiary h-1 rounded-full w-[8%]"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="lg:col-span-2 space-y-6">
                        <h3 class="text-lg font-black font-headline tracking-tighter uppercase italic mb-8">Top Produtos (Influenciados)</h3>
                        <div class="bg-white rounded-xl border border-surface-container overflow-hidden shadow-sm">
                            <table class="w-full text-left">
                                <thead>
                                    <tr class="bg-surface border-b border-surface-container">
                                        <th class="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-black text-neutral-400">Produto</th>
                                        <th class="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-black text-neutral-400">Frequência</th>
                                        <th class="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-black text-neutral-400">Conversão</th>
                                        <th class="px-6 py-4 text-[10px] uppercase tracking-[0.2em] font-black text-neutral-400 text-right">Receita</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-surface-container">
                                    <tr class="hover:bg-surface-container-low transition-colors group">
                                        <td class="px-6 py-4">
                                            <div class="flex items-center gap-4">
                                                <div class="h-12 w-10 bg-neutral-100 rounded overflow-hidden">
                                                    <img src="https://lh3.googleusercontent.com/aida-public/AB6AXuBH156ydK6lOm2wIKGX4wchlXq725fPwGrKbE3QXhc73Y8H4BiPfjNRaWTg0frtDyvcdL8tibnAARMg_HgeCjFEJ3UIdNvFA40anwUSLuEByN1lDg9BpBi6imGd19r0SSPw6MkjrG97MQmTnN-3H7GQh8fVXDwvBsdZnd3XJMxjG0sy2Iv7n4ah2zJG9oCRwaU5TVYXZaczS5XNoLdvOXwzGjV0mH9zK-L3gTKnCGeclpScPCvzN7gQjafPZh_S6nMhkB9CpS_peow" alt="P1" class="w-full h-full object-cover">
                                                </div>
                                                <div>
                                                    <p class="text-xs font-black uppercase tracking-tight">Sobretudo Wool Premium</p>
                                                    <p class="text-[9px] text-neutral-400 font-bold">#WF-9021</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-6 py-4 text-[11px] font-bold">2.4k</td>
                                        <td class="px-6 py-4">
                                            <span class="text-[9px] font-black text-tertiary bg-tertiary/10 px-2 py-1 rounded-full">+12.4%</span>
                                        </td>
                                        <td class="px-6 py-4 text-xs font-black text-right">R$ 442k</td>
                                    </tr>
                                </tbody>
            </table>
                        </div>
                    </div>
                </section>
                `;
            case 'tryon':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Looks Gerados via IA</h2>
                    <p class="text-xs text-[#5F5E5E] font-bold uppercase tracking-widest mt-2">Histórico completo de composições e experimentos visuais.</p>
                </div>

                <div class="bg-surface-container-low border border-surface-container rounded-2xl p-8 mb-12 flex items-center justify-between shadow-sm">
                    <div class="flex items-center gap-6">
                        <div class="p-4 bg-tertiary/10 rounded-xl">
                            <span class="material-symbols-outlined text-tertiary text-3xl">auto_awesome</span>
                        </div>
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-widest text-neutral-400">Capacidade de Processamento</p>
                            <h4 class="text-2xl font-black font-headline tracking-tighter text-[#1A1A1A]">Motor Atelier IA v2.4</h4>
                        </div>
                    </div>
                    <div class="bg-surface-container-lowest px-6 py-4 rounded-xl border border-surface-container flex items-center gap-4">
                        <div class="h-2 w-32 bg-surface-container rounded-full overflow-hidden">
                            <div class="h-full bg-tertiary w-[75%]"></div>
                        </div>
                        <span class="text-[10px] font-black text-tertiary uppercase tracking-widest">75% Disponível</span>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8 mb-20">
                    ${jobs.length === 0 ? `
                        <div class="col-span-full py-20 bg-surface-container-low border-2 border-dashed border-surface-container rounded-3xl flex flex-col items-center justify-center text-center">
                            <span class="material-symbols-outlined text-neutral-300 text-6xl mb-4">image_not_supported</span>
                            <p class="text-sm font-black text-neutral-400 uppercase tracking-widest">Nenhum look gerado ainda</p>
                        </div>
                    ` : jobs.slice(0, 12).map(j => `
                        <div class="group bg-white rounded-2xl border border-surface-container overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 ease-out-expo">
                            <div class="aspect-[3/4] relative overflow-hidden bg-surface-container-low">
                                <img src="${j.resultImageUrl || j.inputPersonUrl}" alt="Job" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110">
                                <div class="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur-sm rounded text-[9px] font-black uppercase tracking-widest shadow-sm">
                                    ${j.status === 'SUCCESS' || j.status === 'done' ? '<span class="text-tertiary">Finalizado</span>' : '<span class="text-error">Pendente</span>'}
                                </div>
                            </div>
                            <div class="p-5">
                                <p class="text-[10px] text-neutral-400 font-black uppercase tracking-widest">Preview ${j.productType || 'Outfit'}</p>
                                <p class="text-xs font-black text-[#1A1A1A] mt-1">ID: #WF-${j.id.slice(-4).toUpperCase()}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="mt-20">
                    <div class="mb-8">
                        <h2 class="text-2xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] uppercase italic italic">Fila de Processamento Detalhada</h2>
                    </div>
                    <div class="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-surface">
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 px-8">ID Job</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 px-8">Produto</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 px-8 text-center">Status</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 px-8 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-neutral-50">
                                ${jobs.map(j => `
                                    <tr class="hover:bg-surface/50 transition-colors">
                                        <td class="p-6 px-8 font-mono text-[10px] text-neutral-400">#${j.id.split('-')[0]}</td>
                                        <td class="p-6 px-8">
                                            <div class="text-[11px] font-black text-[#1A1A1A] uppercase tracking-wide italic">${j.productType || 'Fashion'}</div>
                                        </td>
                                        <td class="p-6 px-8">
                                            <div class="flex items-center justify-center gap-2">
                                                <div class="w-2 h-2 rounded-full ${j.status === 'done' || j.status === 'SUCCESS' ? 'bg-tertiary' : 'bg-primary animate-pulse'}"></div>
                                                <span class="text-[9px] font-black uppercase tracking-widest">${j.status}</span>
                                            </div>
                                        </td>
                                        <td class="p-6 px-8 text-right">
                                            <div class="flex justify-end gap-2 text-xs">
                                                ${j.resultImageUrl ? `<a href="${j.resultImageUrl}" target="_blank" class="p-2 border border-neutral-100 rounded-lg hover:border-primary transition-all"><span class="material-symbols-outlined text-sm">visibility</span></a>` : ''}
                                                <button class="p-2 border border-neutral-100 rounded-lg hover:border-primary transition-all" onclick="alert('JobID: ${j.id}')"><span class="material-symbols-outlined text-sm">info</span></button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                `;
            case 'integration':
                const baseUrl = process.env.APP_URL || 'http://localhost:3000';
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Conexão Atelier</h2>
                    <p class="text-xs text-[#5F5E5E] font-bold uppercase tracking-widest mt-2">Sincronize sua loja com o motor de inteligência neural.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                     <div class="bg-surface-container-lowest p-8 rounded-3xl border border-surface-container shadow-sm">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                                <span class="material-symbols-outlined text-3xl">key</span>
                            </div>
                            <div>
                                <h3 class="text-lg font-headline font-bold text-[#1A1A1A] uppercase tracking-tighter leading-none mb-1">Credenciais de Conexão</h3>
                                <p class="text-[10px] text-[#5F5E5E] font-black uppercase tracking-widest italic">Use estes dados no seu Plugin WordPress</p>
                            </div>
                        </div>

                        <div class="space-y-6">
                            <div>
                                <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">API Base URL</label>
                                <div class="flex items-center gap-2 bg-surface p-4 rounded-xl border border-surface-container group transition-all hover:border-primary">
                                    <code class="text-xs font-mono font-medium flex-1 text-[#1A1A1A]">${baseUrl}</code>
                                    <button class="material-symbols-outlined text-neutral-400 hover:text-primary transition-colors cursor-pointer text-sm" onclick="navigator.clipboard.writeText('${baseUrl}')">content_copy</button>
                                </div>
                                <p class="text-[9px] text-neutral-400 mt-2">URL base do seu painel SaaS WeFashion.</p>
                            </div>

                            <div>
                                <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">Tenant ID</label>
                                <div class="flex items-center gap-2 bg-surface p-4 rounded-xl border border-surface-container group transition-all hover:border-primary">
                                    <code class="text-xs font-mono font-medium flex-1 text-[#1A1A1A]">${t.id}</code>
                                    <button class="material-symbols-outlined text-neutral-400 hover:text-primary transition-colors cursor-pointer text-sm" onclick="navigator.clipboard.writeText('${t.id}')">content_copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">Public Key</label>
                                <div class="flex items-center gap-2 bg-surface p-4 rounded-xl border border-surface-container group transition-all hover:border-primary">
                                    <code class="text-xs font-mono font-medium flex-1 text-[#1A1A1A]">${t.publicKey}</code>
                                    <button class="material-symbols-outlined text-neutral-400 hover:text-primary transition-colors cursor-pointer text-sm" onclick="navigator.clipboard.writeText('${t.publicKey}')">content_copy</button>
                                </div>
                            </div>

                            <div>
                                <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">Install Token</label>
                                <div class="flex items-center gap-2 bg-surface p-4 rounded-xl border border-surface-container group transition-all hover:border-primary">
                                    <code class="text-xs font-mono font-medium flex-1 text-[#1A1A1A]">${t.installToken || 'N/A'}</code>
                                    <button class="material-symbols-outlined text-neutral-400 hover:text-primary transition-colors cursor-pointer text-sm" onclick="navigator.clipboard.writeText('${t.installToken || ''}')">content_copy</button>
                                </div>
                                <button onclick="regenerateInstallToken(this)" class="mt-4 text-[10px] font-black text-primary uppercase tracking-[0.2em] hover:opacity-70 transition-all flex items-center gap-2">
                                    <span class="material-symbols-outlined text-xs">refresh</span> Regenerar Token de Segurança
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="bg-surface-container-lowest p-8 rounded-3xl border border-surface-container shadow-sm flex flex-col">
                        <div class="flex items-center gap-4 mb-8">
                            <div class="w-12 h-12 rounded-2xl bg-tertiary/10 flex items-center justify-center text-tertiary">
                                <span class="material-symbols-outlined text-3xl">hub</span>
                            </div>
                            <div>
                                <h3 class="text-lg font-headline font-bold text-[#1A1A1A] uppercase tracking-tighter leading-none mb-1">Status da Ponte</h3>
                                <p class="text-[10px] text-[#5F5E5E] font-black uppercase tracking-widest italic">Integração Digital Nativa</p>
                            </div>
                        </div>

                        <div class="flex-1 space-y-4">
                            <div class="p-8 rounded-2xl bg-white border border-surface-container flex flex-col items-center text-center">
                                <div class="text-3xl font-headline font-extrabold text-[#1A1A1A] mb-2 uppercase italic">${connected ? 'Conexão Ativa' : 'Desconectado'}</div>
                                <p class="text-xs text-[#5F5E5E] font-bold uppercase tracking-widest mb-8">${connected ? 'Sua loja está online e operando com WeFashion IA' : 'Aguardando sincronização com o plugin'}</p>
                                
                                <a href="/v1/plugin/download" class="px-8 py-4 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-105 transition-all flex items-center gap-3">
                                    <span class="material-symbols-outlined text-lg">cloud_download</span> Baixar Core Plugin .ZIP
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
                `;
            case 'leads':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none text-tertiary">Inteligência de Leads</h2>
                    <p class="text-xs text-[#5F5E5E] font-bold uppercase tracking-widest mt-2">Clientes que salvaram looks e demonstraram interesse real.</p>
                </div>

                <div class="bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                    <div class="p-8 border-b border-neutral-50 flex justify-between items-center bg-surface">
                        <h3 class="text-sm font-bold uppercase tracking-widest text-[#1A1A1A]">Banco de Contatos</h3>
                        <div class="flex gap-4">
                            <button class="px-4 py-2 text-[10px] font-bold uppercase tracking-widest border border-neutral-200 rounded-lg hover:bg-white transition-all shadow-sm flex items-center gap-2" onclick="location.reload()">
                                <span class="material-symbols-outlined text-xs">sync</span> Sincronizar
                            </button>
                        </div>
                    </div>
                    <table class="w-full text-left border-collapse">
                        <thead>
                            <tr class="bg-surface">
                                <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 font-black">Cliente</th>
                                <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 font-black">Contato</th>
                                <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 font-black">Origem / Data</th>
                                <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 font-black text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-neutral-50">
                            ${leadsList.map(l => `
                                <tr class="hover:bg-surface/50 transition-colors group">
                                    <td class="p-6">
                                        <div class="flex items-center gap-3">
                                            <div class="w-8 h-8 rounded-full bg-surface-container flex items-center justify-center font-bold text-[10px] text-primary shadow-inner">
                                                ${(l.name || 'U').charAt(0).toUpperCase()}
                                            </div>
                                            <div>
                                                <div class="text-[11px] font-black text-[#1A1A1A] uppercase tracking-wide group-hover:text-tertiary transition-colors">${l.name || 'Usuário Anônimo'}</div>
                                                <div class="text-[9px] text-neutral-400 font-bold uppercase tracking-tighter">Ref: #WF-${l.jobId.slice(-4).toUpperCase()}</div>
                                            </div>
                                        </div>
                                    </td>
                                    <td class="p-6">
                                        <div class="text-[11px] font-bold text-[#1A1A1A] mb-0.5">${l.email || 'N/A'}</div>
                                        <div class="text-[10px] text-neutral-400 font-medium font-mono">${l.whatsapp || ''}</div>
                                    </td>
                                    <td class="p-6">
                                        <div class="text-[9px] font-black text-white bg-tertiary px-2 py-0.5 rounded-full inline-block uppercase mb-1 shadow-sm">${l.source}</div>
                                        <div class="text-[9px] text-[#5F5E5E] font-bold uppercase tracking-tighter">
                                            ${new Date(l.createdAt).toLocaleDateString('pt-BR')} ${new Date(l.createdAt).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}
                                        </div>
                                    </td>
                                    <td class="p-6 text-right">
                                        <div class="flex justify-end gap-2">
                                            ${l.whatsapp ? `
                                                <a href="https://wa.me/${l.whatsapp.replace(/\D/g,'')}" target="_blank" class="p-2 bg-success/10 text-success rounded-lg hover:bg-success hover:text-white transition-all shadow-sm flex items-center gap-2 border border-success/20">
                                                    <span class="material-symbols-outlined text-sm">chat</span>
                                                    <span class="text-[8px] font-black uppercase tracking-widest">WhatsApp</span>
                                                </a>
                                            ` : ''}
                                            <button class="p-2 border border-neutral-100 rounded-lg hover:border-primary transition-all shadow-sm group-hover:bg-white bg-surface">
                                                <span class="material-symbols-outlined text-sm text-neutral-400 group-hover:text-primary">visibility</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                            ${leadsList.length === 0 ? '<tr><td colspan="4" class="p-20 text-center"><p class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">Nenhum lead capturado ainda.</p></td></tr>' : ''}
                        </tbody>
                    </table>
                </div>
                `;
            case 'analytics':
                 const maxVal = Math.max(...analyticsData.dailyUsage.map(d => d.count), 1);
                 return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase">Centro de Analytics</h2>
                    <p class="text-sm text-[#5F5E5E] font-medium tracking-wide">Conversões atribuídas e eficiência da rede neural.</p>
                </div>

                 <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
                        <p class="text-[10px] font-extrabold uppercase tracking-[0.2em] text-neutral-400 mb-2">Engajamento Total</p>
                        <h4 class="text-3xl font-headline font-extrabold text-[#1A1A1A] mb-1 italic">${analyticsData.conversions}v</h4>
                        <p class="text-xs text-[#5F5E5E]">Interações únicas no provador este mês.</p>
                    </div>
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm">
                        <p class="text-[10px] font-extrabold uppercase tracking-[0.2em] text-neutral-400 mb-2">Service Health</p>
                        <h4 class="text-3xl font-headline font-extrabold text-success mb-1 italic">${analyticsData.successRate}</h4>
                        <p class="text-xs text-[#5F5E5E]">Gerações finalizadas sem anomalias.</p>
                    </div>
                 </div>

                 <div class="bg-white rounded-3xl p-10 border border-neutral-100 shadow-sm mb-12">
                    <div class="flex justify-between items-center mb-12">
                         <h3 class="text-sm font-bold uppercase tracking-widest text-[#1A1A1A]">Volume de Gerações Diárias</h3>
                         <span class="text-[10px] text-neutral-400 font-bold uppercase italic">7 Day Pulse</span>
                    </div>

                    <div class="h-64 flex items-end gap-3 px-4">
                         ${analyticsData.dailyUsage.map(d => `
                            <div class="flex-1 group relative">
                                <div class="w-full bg-[#1A1A1A] rounded-t-lg transition-all duration-700 hover:bg-primary group-hover:scale-x-105" style="height:${(d.count / maxVal) * 100}%"></div>
                                <div class="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white text-[9px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">${d.count}</div>
                                <span class="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[9px] font-bold text-neutral-400 uppercase tracking-widest whitespace-nowrap">${d.date}</span>
                            </div>
                         `).join('')}
                    </div>
                 </div>
                 `;
            case 'global_overview':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Global Control</h2>
                    <p class="text-[10px] font-bold text-[#5F5E5E] uppercase tracking-widest italic">Visão Crítica do Sistema WeFashion Master</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 italic">Network Scale</p>
                        <h4 class="text-4xl font-headline font-black text-[#1A1A1A] mb-1 italic leading-none">482 <span class="text-xs uppercase text-neutral-300 font-bold not-italic">Lojas</span></h4>
                        <p class="text-[9px] text-[#5F5E5E] font-bold uppercase tracking-widest mt-4">+12 novos hoje</p>
                    </div>
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-success"></div>
                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 italic">Live Throughput</p>
                        <h4 class="text-4xl font-headline font-black text-[#1A1A1A] mb-1 italic leading-none">12.4k <span class="text-xs uppercase text-neutral-300 font-bold not-italic">Gerações</span></h4>
                        <p class="text-[9px] text-success font-bold uppercase tracking-widest mt-4">Health Check: Normal</p>
                    </div>
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-warning"></div>
                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 italic">Processing Queue</p>
                        <h4 class="text-4xl font-headline font-black text-[#1A1A1A] mb-1 italic leading-none">${mock ? '0' : '24'} <span class="text-xs uppercase text-neutral-300 font-bold not-italic">Jobs</span></h4>
                        <p class="text-[9px] text-[#5F5E5E] font-bold uppercase tracking-widest mt-4">Delay Médio: 150ms</p>
                    </div>
                    <div class="bg-white p-8 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden group">
                        <div class="absolute top-0 left-0 w-1 h-full bg-error"></div>
                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-2 italic">Error Rate</p>
                        <h4 class="text-4xl font-headline font-black text-error mb-1 italic leading-none">0.14%</h4>
                        <p class="text-[9px] text-[#5F5E5E] font-bold uppercase tracking-widest mt-4">-2% vs ontem</p>
                    </div>
                </div>
                `;
            case 'tenants':
                const autoPassword = 'Wf' + Math.random().toString(36).slice(-6) + '!';
                return `
                <div class="mb-12 flex justify-between items-end">
                    <div>
                        <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Workspace Master</h2>
                        <p class="text-[10px] font-bold text-[#5F5E5E] uppercase tracking-widest italic">Provisionamento e Gestão de Lojistas</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div class="lg:col-span-2 bg-white rounded-3xl border border-neutral-100 shadow-sm overflow-hidden">
                        <div class="p-8 border-b border-neutral-50 bg-surface">
                            <h3 class="text-sm font-bold uppercase tracking-widest text-[#1A1A1A]">Lojas Ativas</h3>
                        </div>
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-surface">
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50">Nome / Empresa</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50">Status</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50">Public Key</th>
                                    <th class="p-6 text-[10px] font-bold uppercase tracking-widest text-neutral-400 border-b border-neutral-50 text-right">Início</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-neutral-50">
                                ${tenantsList.map(tn => `
                                    <tr class="hover:bg-surface/50 transition-colors">
                                        <td class="p-6 italic"><b class="text-[#1A1A1A] uppercase tracking-wide text-xs">${tn.name}</b></td>
                                        <td class="p-6">
                                            <span class="inline-flex items-center px-3 py-1 bg-success/10 text-success text-[10px] font-black uppercase tracking-widest rounded-full">${tn.status}</span>
                                        </td>
                                        <td class="p-6 font-mono text-[10px] text-neutral-400">${tn.publicKey}</td>
                                        <td class="p-6 text-right text-[10px] font-bold text-[#5F5E5E] uppercase">${new Date(tn.createdAt).toLocaleDateString()}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div class="bg-[#1A1A1A] p-10 rounded-[3rem] text-white">
                        <h3 class="text-xl font-headline font-bold uppercase tracking-tighter mb-8 italic">New Provision</h3>
                        <form id="createTenantForm" class="space-y-6">
                            <div>
                                <label class="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 block">Enterprise Name</label>
                                <input type="text" id="tName" required class="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-bold uppercase tracking-widest focus:border-primary outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 block">Admin Master Email</label>
                                <input type="email" id="tEmail" required class="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-bold tracking-widest focus:border-primary outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-2 block">Auto-Generated Password</label>
                                <input type="text" id="tPassword" value="${autoPassword}" required class="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-xs font-mono tracking-widest focus:border-primary outline-none transition-all">
                            </div>
                            <button type="submit" id="btnCreateTenant" class="w-full py-5 bg-white text-[#1A1A1A] rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] transition-all">Provisionar Agora</button>
                        </form>
                    </div>
                </div>

                <script>
                    document.getElementById('createTenantForm')?.addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const btn = document.getElementById('btnCreateTenant');
                        const originalText = btn.innerText;
                        btn.innerText = 'PROVISIONANDO...';
                        btn.disabled = true;
                        try {
                            const res = await fetch('/v1/admin/tenants', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    name: document.getElementById('tName').value,
                                    email: document.getElementById('tEmail').value,
                                    password: document.getElementById('tPassword').value
                                })
                            });
                            const data = await res.json();
                            if(res.ok) {
                                alert('Enterprise provisionada com sucesso!');
                                window.location.reload();
                            } else alert('Erro: ' + data.error);
                        } catch(err) { alert('Falha crítica de rede.'); }
                        finally { btn.innerText = originalText; btn.disabled = false; }
                    });
                </script>
                `;
            case 'observability':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Observability Portal</h2>
                    <p class="text-[10px] font-bold text-[#5F5E5E] uppercase tracking-widest italic">Análise de Health Check e Performance do Runtime</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                    <div class="bg-white p-10 rounded-3xl border border-neutral-100 shadow-sm">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-6 italic border-b border-neutral-50 pb-4">Memory Stack</p>
                        <h4 class="text-3xl font-headline font-black text-[#1A1A1A] mb-1 italic leading-none">${health.memory}</h4>
                        <p class="text-xs text-neutral-400 mt-4 lowercase font-mono italic tracking-tighter">Current process usage</p>
                    </div>
                    <div class="bg-white p-10 rounded-3xl border border-neutral-100 shadow-sm">
                        <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-6 italic border-b border-neutral-50 pb-4">Engine Logic</p>
                        <h4 class="text-3xl font-headline font-black text-[#1A1A1A] mb-1 italic leading-none">Node ${health.nodeVersion}</h4>
                        <p class="text-xs text-neutral-400 mt-4 lowercase font-mono italic tracking-tighter">${health.platform}</p>
                    </div>
                    <div class="bg-[#1A1A1A] p-10 rounded-3xl text-white flex flex-col justify-center items-center">
                         <div class="w-3 h-3 bg-success rounded-full animate-ping mb-4"></div>
                         <h4 class="text-xl font-headline font-black uppercase italic leading-none tracking-tighter">Systems Nominal</h4>
                    </div>
                </div>
                `;
            case 'settings':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Master Settings</h2>
                    <p class="text-[10px] font-bold text-[#5F5E5E] uppercase tracking-widest italic">Configurações de Identidade e Segurança do Workspace</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div class="bg-white p-10 rounded-3xl border border-neutral-100 shadow-sm">
                         <div class="flex items-center gap-4 mb-10">
                            <div class="w-12 h-12 rounded-2xl bg-[#1A1A1A] flex items-center justify-center text-white">
                                <span class="material-symbols-outlined">identity_platform</span>
                            </div>
                            <h3 class="text-lg font-headline font-bold text-[#1A1A1A] uppercase tracking-tighter italic">Workspace Identity</h3>
                         </div>
                         <div class="space-y-8">
                            <div>
                                <label class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-2 block italic text-right">Business Entity Name</label>
                                <input type="text" id="storeName" value="${t.name}" class="w-full bg-surface border border-neutral-100 p-5 rounded-2xl text-sm font-bold uppercase tracking-widest text-[#1A1A1A] focus:border-[#1A1A1A] outline-none transition-all">
                            </div>
                            <div>
                                <label class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-2 block italic text-right">Administrative Email</label>
                                <input type="text" value="${userEmail}" disabled class="w-full bg-surface border border-neutral-50 p-5 rounded-2xl text-sm font-bold tracking-widest text-neutral-300 cursor-not-allowed italic">
                            </div>
                         </div>
                    </div>

                    <div class="bg-surface p-10 rounded-3xl border border-neutral-100 shadow-inner flex flex-col justify-between">
                         <div>
                            <div class="flex items-center gap-4 mb-10">
                                <div class="w-12 h-12 rounded-2xl bg-error/10 flex items-center justify-center text-error">
                                    <span class="material-symbols-outlined">security</span>
                                </div>
                                <h3 class="text-lg font-headline font-bold text-[#1A1A1A] uppercase tracking-tighter italic">Cortex Protection</h3>
                            </div>
                            <p class="text-xs text-[#5F5E5E] font-medium leading-relaxed mb-10">Gerencie protocolos de acesso e chaves mestras. Recomenda-se a troca de senha a cada 90 dias.</p>
                         </div>
                         <button class="w-full py-5 border border-error/20 text-error rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:bg-error hover:text-white transition-all shadow-sm">Reset Security Protocol</button>
                    </div>
                </div>
                `;
            case 'billing':
                const usagePercent = Math.min(100, Math.round((t.proofsUsedThisMonth / (t.proofsMonthlyLimit || 1)) * 100));
                const remaining = Math.max(0, (t.proofsBalance));
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Subscription & Usage</h2>
                    <p class="text-[10px] font-bold text-[#5F5E5E] uppercase tracking-widest italic">Gestão de Consumo e Faturamento Estratégico</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-12">
                    <!-- Usage Card -->
                    <div class="lg:col-span-2 bg-white p-10 rounded-3xl border border-neutral-100 shadow-sm">
                        <div class="flex justify-between items-end mb-8">
                            <div>
                                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-1">Status de Consumo</p>
                                <h4 class="text-2xl font-headline font-black text-[#1A1A1A] uppercase italic leading-none">${t.proofsUsedThisMonth} de ${t.proofsMonthlyLimit || 0} PROVAS <span class="text-xs font-bold text-neutral-300 not-italic">/ MÊS</span></h4>
                            </div>
                            <div class="text-right">
                                <p class="text-3xl font-headline font-black text-primary italic leading-none">${remaining}</p>
                                <p class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest">Restantes</p>
                            </div>
                        </div>
                        
                        <!-- Progress Bar -->
                        <div class="w-full h-4 bg-neutral-50 rounded-full overflow-hidden mb-4 p-1 border border-neutral-100">
                            <div class="h-full rounded-full transition-all duration-1000 bg-gradient-to-r ${usagePercent > 80 ? 'from-error to-error/80' : 'from-primary to-primary-dim'}" style="width: ${usagePercent}%"></div>
                        </div>
                        
                        <div class="flex justify-between items-center mt-6">
                            <p class="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">${usagePercent}% Utilizado</p>
                            ${usagePercent > 80 ? '<p class="text-[10px] text-error font-black uppercase tracking-widest animate-pulse">Atenção: Limite Próximo</p>' : ''}
                        </div>
                    </div>

                    <!-- Plan Overview -->
                    <div class="bg-[#1A1A1A] p-10 rounded-[3rem] text-white flex flex-col justify-between relative overflow-hidden">
                        <div class="absolute -top-10 -right-10 w-40 h-40 bg-primary/20 rounded-full blur-3xl"></div>
                        <div class="relative z-10">
                            <p class="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-4 italic">Plano Atual</p>
                            <h3 class="text-4xl font-headline font-black uppercase italic leading-none tracking-tighter mb-4">${t.plan}</h3>
                            <div class="inline-flex items-center px-3 py-1 bg-white/10 rounded-full text-[9px] font-bold uppercase tracking-widest text-primary mb-8 border border-white/5">Auto-Renewing</div>
                        </div>
                        <div class="relative z-10 space-y-3">
                            <button onclick="openStripePortal()" class="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Gerenciar Assinatura</button>
                            <a href="/?section=plans" class="block w-full py-4 bg-primary text-[#1A1A1A] rounded-2xl text-[10px] text-center font-black uppercase tracking-widest hover:scale-[1.02] transition-all">Upgrade de Plano</a>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <!-- Extra Proofs -->
                    <div class="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10 shadow-sm group hover:shadow-md transition-all">
                        <span class="material-symbols-outlined text-tertiary mb-4">bolt</span>
                        <h4 class="text-sm font-black uppercase tracking-widest text-[#1A1A1A] mb-2">Comprar Provas</h4>
                        <p class="text-xs text-[#5F5E5E] leading-relaxed mb-6">Precisa de escala imediata? Adicione pacotes de provas avulsas à sua conta.</p>
                        <a href="/?section=plans#packages" class="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#1A1A1A] hover:gap-2 transition-all">Ver Pacotes <span class="material-symbols-outlined text-xs ml-1">arrow_forward</span></a>
                    </div>
                    
                    <div class="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
                        <span class="material-symbols-outlined text-primary mb-4">calendar_today</span>
                        <h4 class="text-sm font-black uppercase tracking-widest text-[#1A1A1A] mb-2">Próximo Reset</h4>
                        <p class="text-3xl font-headline font-black text-[#1A1A1A] italic leading-none mb-1">${t.currentPeriodEnd ? new Date(t.currentPeriodEnd).toLocaleDateString() : 'N/A'}</p>
                        <p class="text-[9px] uppercase tracking-widest font-bold text-neutral-400">Ciclo de Renovação</p>
                    </div>

                    <div class="bg-surface-container-low p-8 rounded-3xl border border-outline-variant/10 shadow-sm">
                        <span class="material-symbols-outlined text-tertiary mb-4">receipt_long</span>
                        <h4 class="text-sm font-black uppercase tracking-widest text-[#1A1A1A] mb-2">Histórico</h4>
                        <p class="text-xs text-[#5F5E5E] leading-relaxed mb-6">Acesse todas as faturas e notas fiscais geradas pela WeFashion.</p>
                        <button onclick="openStripePortal()" class="text-[10px] font-black uppercase tracking-widest text-[#1A1A1A] border-b-2 border-tertiary/20 hover:border-tertiary transition-all">Download Invoices</button>
                    </div>
                </div>

                <script>
                    async function openStripePortal() {
                        const res = await fetch('/v1/billing/portal', { method: 'POST' });
                        const data = await res.json();
                        if(data.url) window.location.href = data.url;
                        else alert('Erro ao abrir portal: ' + (data.error || 'Tente novamente.'));
                    }
                </script>
                `;
            case 'plans':
                const plans = [
                    { name: 'Starter', price: '59', limit: 50, priceId: 'price_starter_id', color: 'primary' },
                    { name: 'Growth', price: '119', limit: 150, priceId: 'price_growth_id', color: 'tertiary' },
                    { name: 'Pro', price: '229', limit: 400, priceId: 'price_pro_id', color: '[#1A1A1A]', text: 'white' }
                ];
                const packages = [
                    { name: 'Eco', amount: 50, price: '29', priceId: 'price_topup_50' },
                    { name: 'Standard', amount: 150, price: '79', priceId: 'price_topup_150' },
                    { name: 'Volume', amount: 500, price: '199', priceId: 'price_topup_500' }
                ];

                return `
                <div class="mb-12 text-center">
                    <span class="text-[10px] uppercase tracking-[0.4em] text-tertiary mb-4 block font-black">Escalabilidade Neural</span>
                    <h2 class="text-5xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-4 uppercase italic leading-none">Escolha sua Potência</h2>
                    <p class="text-xs font-bold text-[#5F5E5E] uppercase tracking-widest italic max-w-2xl mx-auto">Planos projetados para marcas que buscam alta conversão através da simulação perfeita.</p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
                    ${plans.map(p => `
                        <div class="bg-white rounded-[3rem] border border-neutral-100 shadow-sm p-10 flex flex-col justify-between relative overflow-hidden group hover:shadow-xl transition-all duration-500">
                            ${p.name === 'Growth' ? '<div class="absolute top-8 -right-12 bg-tertiary text-white text-[8px] font-black uppercase tracking-[0.3em] py-2 px-12 rotate-45 shadow-sm">Popular</div>' : ''}
                            <div>
                                <p class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 mb-8 border-b border-neutral-50 pb-4">Plano ${p.name}</p>
                                <div class="flex items-baseline gap-1 mb-8">
                                    <span class="text-2xl font-headline font-black text-[#1A1A1A]">R$</span>
                                    <span class="text-6xl font-headline font-black text-[#1A1A1A] tracking-tighter italic">${p.price}</span>
                                    <span class="text-xs font-bold text-neutral-300 uppercase tracking-widest">/mês</span>
                                </div>
                                <ul class="space-y-4 mb-10">
                                    <li class="flex items-center gap-3 text-xs font-bold text-[#1A1A1A] italic">
                                        <span class="material-symbols-outlined text-success text-lg">check_circle</span>
                                        ${p.limit} Provas Mensais
                                    </li>
                                    <li class="flex items-center gap-3 text-xs font-bold text-[#1A1A1A] italic">
                                        <span class="material-symbols-outlined text-success text-lg">check_circle</span>
                                        Suporte Prioritário
                                    </li>
                                    <li class="flex items-center gap-3 text-xs font-bold text-[#1A1A1A] italic">
                                        <span class="material-symbols-outlined text-success text-lg">check_circle</span>
                                        Analytics Avançado
                                    </li>
                                </ul>
                            </div>
                            <button onclick="subscribe('${p.priceId}')" class="w-full py-5 ${p.name === 'Pro' ? 'bg-[#1A1A1A] text-white' : 'bg-primary text-[#1A1A1A]'} rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] transition-all shadow-md">
                                ${t.plan === p.name.toLowerCase() ? 'Plano Atual' : 'Assinar Agora'}
                            </button>
                        </div>
                    `).join('')}
                </div>

                <div id="packages" class="pt-20 border-t border-neutral-100">
                    <div class="mb-12 text-center">
                        <h3 class="text-3xl font-headline font-black uppercase italic tracking-tighter text-[#1A1A1A]">Pacotes Adicionais</h3>
                        <p class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mt-2 italic">Saldo cumulativo para momentos de alta demanda</p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
                        ${packages.map(pkg => `
                            <div class="bg-surface p-10 rounded-3xl border border-neutral-100 shadow-sm relative overflow-hidden flex justify-between items-center group">
                                <div class="absolute top-0 left-0 w-1 h-full bg-tertiary/20"></div>
                                <div>
                                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary mb-2 italic">Pacote ${pkg.name}</p>
                                    <h4 class="text-3xl font-headline font-black text-[#1A1A1A] italic leading-none">${pkg.amount} <span class="text-xs uppercase text-neutral-300 font-bold not-italic tracking-widest">Provas</span></h4>
                                </div>
                                <div class="text-right">
                                    <p class="text-xl font-headline font-black text-[#1A1A1A] italic mb-4">R$ ${pkg.price}</p>
                                    <button onclick="buyProofs('${pkg.priceId}', ${pkg.amount})" class="px-6 py-3 bg-white border border-neutral-200 text-[9px] font-black uppercase tracking-widest rounded-xl hover:bg-[#1A1A1A] hover:text-white hover:border-[#1A1A1A] transition-all shadow-sm">Comprar</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <script>
                    async function subscribe(priceId) {
                        try {
                            const res = await fetch('/v1/billing/checkout', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ priceId })
                            });
                            const data = await res.json();
                            if(data.url) window.location.href = data.url;
                            else alert('Erro: ' + data.error);
                        } catch(err) { alert('Falha ao processar pagamento.'); }
                    }

                    async function buyProofs(priceId, amount) {
                        try {
                            const res = await fetch('/v1/billing/buy-proofs', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ priceId, proofsAmount: amount })
                            });
                            const data = await res.json();
                            if(data.url) window.location.href = data.url;
                            else alert('Erro: ' + data.error);
                        } catch(err) { alert('Falha ao processar recarga.'); }
                    }
                </script>
                `;
            case 'marketing':
                return `
                <div class="mb-12">
                    <h2 class="text-4xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] mb-2 uppercase italic leading-none">Central de Marketing</h2>
                    <p class="text-xs text-[#5F5E5E] font-bold uppercase tracking-widest mt-2">Gestão de relacionamento, onboarding e funil de e-mails via Resend.</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <!-- Templates Catalog -->
                    <div class="lg:col-span-2">
                        <div class="flex items-center justify-between mb-8">
                            <h3 class="text-xl font-black font-headline tracking-tighter uppercase italic">Modelos de Comunicação</h3>
                            <span class="px-3 py-1 bg-surface-container text-[#5F5E5E] text-[8px] font-black uppercase tracking-widest rounded-full">4 Modelos Ativos</span>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <!-- Template card: Welcome -->
                            <div class="bg-white p-6 rounded-2xl border border-surface-container hover:shadow-lg transition-all group">
                                <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary mb-4">
                                    <span class="material-symbols-outlined text-xl">auto_awesome</span>
                                </div>
                                <h4 class="text-sm font-black uppercase tracking-tight mb-2">Boas-vindas (Onboarding)</h4>
                                <p class="text-[10px] text-neutral-400 font-medium leading-relaxed mb-6">Disparado no momento da criação da conta. Foco em introdução e primeiro login.</p>
                                <div class="flex items-center justify-between pt-4 border-t border-surface-container">
                                    <span class="text-[9px] font-black text-tertiary uppercase tracking-widest italic">Status: Pronto</span>
                                    <button class="text-[9px] font-black uppercase tracking-widest hover:underline" onclick="document.getElementById('test-template-id').value='WELCOME'; document.getElementById('test-template-name').innerText='Boas-vindas'">Selecionar para Teste</button>
                                </div>
                            </div>

                            <!-- Template card: Payment Approved -->
                            <div class="bg-white p-6 rounded-2xl border border-surface-container hover:shadow-lg transition-all group">
                                <div class="w-10 h-10 bg-tertiary/10 rounded-xl flex items-center justify-center text-tertiary mb-4">
                                    <span class="material-symbols-outlined text-xl">verified</span>
                                </div>
                                <h4 class="text-sm font-black uppercase tracking-tight mb-2">Pagamento Aprovado</h4>
                                <p class="text-[10px] text-neutral-400 font-medium leading-relaxed mb-6">Enviado após confirmação do Stripe. Inclui saldo de créditos e boas-vindas ao VIP.</p>
                                <div class="flex items-center justify-between pt-4 border-t border-surface-container">
                                    <span class="text-[9px] font-black text-tertiary uppercase tracking-widest italic">Status: Pronto</span>
                                    <button class="text-[9px] font-black uppercase tracking-widest hover:underline" onclick="document.getElementById('test-template-id').value='PAYMENT_APPROVED'; document.getElementById('test-template-name').innerText='Pagamento Aprovado'">Selecionar para Teste</button>
                                </div>
                            </div>

                            <!-- Template card: Rewards -->
                            <div class="bg-white p-6 rounded-2xl border border-surface-container hover:shadow-lg transition-all group">
                                <div class="w-10 h-10 bg-success/10 rounded-xl flex items-center justify-center text-success mb-4">
                                    <span class="material-symbols-outlined text-xl">redeem</span>
                                </div>
                                <h4 class="text-sm font-black uppercase tracking-tight mb-2">Parabéns & Recompensas</h4>
                                <p class="text-[10px] text-neutral-400 font-medium leading-relaxed mb-6">E-mail de relacionamento para bonificações manuais ou marcos de uso.</p>
                                <div class="flex items-center justify-between pt-4 border-t border-surface-container">
                                    <span class="text-[9px] font-black text-tertiary uppercase tracking-widest italic">Status: Pronto</span>
                                    <button class="text-[9px] font-black uppercase tracking-widest hover:underline" onclick="document.getElementById('test-template-id').value='REWARDS'; document.getElementById('test-template-name').innerText='Parabéns & Recompensas'">Selecionar para Teste</button>
                                </div>
                            </div>

                            <!-- Template card: Suporte -->
                            <div class="bg-white p-6 rounded-2xl border border-surface-container hover:shadow-lg transition-all group">
                                <div class="w-10 h-10 bg-neutral-100 rounded-xl flex items-center justify-center text-[#1A1A1A] mb-4">
                                    <span class="material-symbols-outlined text-xl">support_agent</span>
                                </div>
                                <h4 class="text-sm font-black uppercase tracking-tight mb-2">Pós-Venda & Retenção</h4>
                                <p class="text-[10px] text-neutral-400 font-medium leading-relaxed mb-6">Acompanhamento automático após X dias sem uso do provador. Incentiva o retorno.</p>
                                <div class="flex items-center justify-between pt-4 border-t border-surface-container">
                                    <span class="text-[9px] font-black text-tertiary uppercase tracking-widest italic">Status: Pronto</span>
                                    <button class="text-[9px] font-black uppercase tracking-widest hover:underline" onclick="document.getElementById('test-template-id').value='SUPPORT_CHECK'; document.getElementById('test-template-name').innerText='Pós-Venda & Retenção'">Selecionar para Teste</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Test Panel -->
                    <div class="lg:col-span-1">
                        <div class="bg-surface-container-low border border-surface-container rounded-3xl p-8 sticky top-24">
                            <h3 class="text-sm font-black uppercase tracking-widest mb-6 flex items-center gap-2">
                                <span class="material-symbols-outlined text-lg">science</span> Enviar E-mail Teste
                            </h3>

                            <form onsubmit="sendTestEmail(event)" class="space-y-6">
                                <input type="hidden" id="test-template-id" value="WELCOME">
                                <div>
                                    <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">Modelo Selecionado</label>
                                    <div id="test-template-name" class="p-4 bg-white rounded-xl border border-surface-container text-xs font-black italic uppercase text-[#1A1A1A]">
                                        Boas-vindas
                                    </div>
                                </div>

                                <div>
                                    <label class="text-[10px] font-black uppercase tracking-widest text-neutral-400 block mb-2">E-mail de Destino</label>
                                    <input type="email" id="test-to-email" required placeholder="ex: dev@wefashion.marketing" class="w-full bg-white border border-surface-container rounded-xl p-4 text-xs font-medium focus:ring-0 focus:border-primary">
                                </div>

                                <button type="submit" id="test-btn" class="w-full py-4 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-xl hover:scale-[1.02] transition-all flex items-center justify-center gap-2">
                                    Disparar Teste Real
                                </button>
                                
                                <div id="test-feedback" class="hidden p-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center"></div>
                            </form>

                            <div class="mt-8 pt-8 border-t border-surface-container">
                                <p class="text-[9px] text-neutral-400 font-black uppercase tracking-widest mb-4">Métricas de Vanidade (Geral)</p>
                                <div class="grid grid-cols-2 gap-4">
                                    <div>
                                        <p class="text-lg font-black italic">98.4%</p>
                                        <p class="text-[8px] text-neutral-400 uppercase font-black">Entrega</p>
                                    </div>
                                    <div>
                                        <p class="text-lg font-black italic">62.1%</p>
                                        <p class="text-[8px] text-neutral-400 uppercase font-black">Abertura</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <script>
                    async function sendTestEmail(e) {
                        e.preventDefault();
                        const btn = document.getElementById('test-btn');
                        const fb = document.getElementById('test-feedback');
                        const templateId = document.getElementById('test-template-id').value;
                        const to = document.getElementById('test-to-email').value;

                        btn.innerText = 'ENVIANDO...';
                        btn.disabled = true;
                        fb.classList.add('hidden');

                        try {
                            const res = await fetch('/v1/admin/marketing/test-email', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ to, templateId })
                            });

                            const data = await res.json();
                            
                            fb.classList.remove('hidden');
                            if (data.success) {
                                fb.innerText = 'SUCESSO: E-MAIL ENVIADO COM SUCESSO!';
                                fb.className = 'p-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center bg-success/10 text-success';
                            } else {
                                fb.innerText = 'ERRO: ' + (data.error || 'FALHA NO ENVIO');
                                fb.className = 'p-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center bg-error/10 text-error';
                            }
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO COM A API';
                            fb.className = 'p-4 rounded-xl text-[10px] font-black uppercase tracking-widest text-center bg-error/10 text-error';
                        } finally {
                            btn.innerText = 'DISPARAR TESTE REAL';
                            btn.disabled = false;
                        }
                    }
                </script>
                `;
            default:
                return `<div class="content-card"><h3>Seção em Desenvolvimento</h3><p>Estamos trabalhando na seção <b>${s}</b> para a próxima atualização.</p></div>`;
        }
    }

      res.send(html);
    } catch (error: any) {
      console.error('[Dashboard Error]', error);
      res.status(500).send(`
        <div style="font-family: sans-serif; padding: 40px; text-align: center; background: #fafafa; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center;">
          <h1 style="font-size: 64px; margin: 0; color: #1a1a1a;">Ops!</h1>
          <p style="font-size: 18px; color: #666; margin-bottom: 30px;">Ocorreu um erro ao carregar o seu painel.</p>
          <div style="background: white; padding: 20px; border-radius: 12px; border: 1px solid #eee; text-align: left; max-width: 600px; width: 100%;">
            <p style="margin: 0; font-size: 12px; font-family: monospace; color: #e53e3e;">${error.message}</p>
          </div>
          <a href="/" style="margin-top: 30px; text-decoration: none; background: #1a1a1a; color: white; padding: 12px 24px; rounded: 8px; font-weight: bold; font-size: 14px;">Tentar Novamente</a>
        </div>
      `);
    }
  }
}
