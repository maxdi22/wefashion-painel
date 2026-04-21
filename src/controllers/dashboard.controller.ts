import { Request, Response } from 'express';
import os from 'os';
import { prisma } from '../lib/prisma';

export class DashboardController {
  private static readonly APP_URL = process.env.APP_URL || 'http://localhost:3000';

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
        orderBy: { createdAt: 'desc' },
        include: { users: true }
      });
    }

    // 4. Buscar Métricas Reais para Analytics
    let analyticsData = {
      successRate: '0%',
      conversions: 0,
      totalJobsCount: 0,
      dailyUsage: [] as { date: string, count: number }[]
    };

    if (section === 'analytics' || section === 'dashboard') {
      const totalJobs = await prisma.tryOnJob.count({ where: whereClause });
      analyticsData.totalJobsCount = totalJobs;
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

      const dailyMap: Record<string, number> = {};
      usageStats.forEach(stat => {
        const dateKey = stat.createdAt.toISOString().split('T')[0];
        dailyMap[dateKey] = (dailyMap[dateKey] || 0) + stat._count;
      });

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
    <title>WeFashion | Painel Digital Atelier</title>
    <script src="https://cdn.tailwindcss.com?plugins=forms,container-queries"></script>
    <link href="https://fonts.googleapis.com" rel="preconnect"/>
    <link crossorigin="" href="https://fonts.gstatic.com" rel="preconnect"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Plus+Jakarta+Sans:ital,wght@0,600;0,700;0,800;1,800&display=swap" rel="stylesheet"/>
    <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet"/>
    <script id="tailwind-config">
        tailwind.config = {
          darkMode: "class",
          theme: {
            extend: {
              "colors": {
                      "primary": "#5f5e5e",
                      "primary-dim": "#535252",
                      "secondary": "#5f5f5f",
                      "tertiary": "#5c5d74",
                      "surface": "#f9f9f9",
                      "success": "#22c55e",
                      "error": "#9e3f4e",
                      "surface-container-low": "#f2f4f4",
                      "surface-container": "#ebeeef"
              },
              "borderRadius": {
                      "DEFAULT": "0.25rem",
                      "lg": "0.5rem",
                      "xl": "0.75rem",
                      "full": "9999px"
              },
              "fontFamily": {
                      "headline": ["Plus Jakarta Sans", "sans-serif"],
                      "body": ["Inter", "sans-serif"]
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
        i { font-style: italic; }
    </style>
</head>
<body class="bg-[#F8F8F8] font-body text-[#1A1A1A] antialiased">
    <aside class="fixed left-0 top-0 h-full flex flex-col py-10 bg-white h-screen w-64 border-r border-[#F0F0F0] z-50">
        <div class="px-8 mb-12">
            <h1 class="text-2xl font-bold tracking-tight text-[#1A1A1A] font-headline">WeFashion</h1>
            <p class="text-[10px] uppercase tracking-[0.3em] text-[#A0A0A0] mt-1 font-bold">Digital Atelier</p>
        </div>
        
        <nav class="flex-1 space-y-1">
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'dashboard' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=dashboard">
                <span class="material-symbols-outlined text-xl">grid_view</span> Painel Geral
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'tryon' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=tryon">
                <span class="material-symbols-outlined text-xl">auto_awesome</span> Provador Virtual
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'products' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=products">
                <span class="material-symbols-outlined text-xl">description</span> Meus Produtos
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'analytics' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=analytics">
                <span class="material-symbols-outlined text-xl">bar_chart</span> Análise de Dados
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'leads' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=leads">
                <span class="material-symbols-outlined text-xl">group</span> Gestão de Leads
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'integration' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=integration">
                <span class="material-symbols-outlined text-xl">settings_input_component</span> Ativação do Plugin
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'billing' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=billing">
                <span class="material-symbols-outlined text-xl">credit_card</span> Assinatura e Planos
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'settings' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=settings">
                <span class="material-symbols-outlined text-xl">settings</span> Configurações Gerais
            </a>

            ${isSuperAdmin ? `
            <div class="px-8 text-[9px] uppercase tracking-[0.2em] text-[#A0A0A0] mt-10 mb-4 font-black italic">Escopo Administrativo</div>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'tenants' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=tenants">
                <span class="material-symbols-outlined text-xl">hub</span> Gestão de Lojas
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'marketing' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=marketing">
                <span class="material-symbols-outlined text-xl">mail</span> Central de Marketing
            </a>
            <a class="flex items-center gap-4 py-3 pl-8 transition-all duration-300 ease-out-expo font-headline tracking-tight text-[13px] ${section === 'observability' ? 'text-[#1A1A1A] font-extrabold border-l-4 border-[#1A1A1A] bg-[#F9F9F9]' : 'text-[#808080] hover:text-[#1A1A1A] hover:bg-[#F9F9F9]'}" href="/?section=observability">
                <span class="material-symbols-outlined text-xl">analytics</span> Monitoramento
            </a>
            ` : ''}
        </nav>
        
        <div class="px-8 mt-auto pt-8">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-lg bg-[#F5F5F5] flex items-center justify-center font-bold text-[#1A1A1A] italic shadow-sm">${email.charAt(0).toUpperCase()}</div>
                <div class="overflow-hidden">
                    <p class="text-sm font-bold text-[#1A1A1A] truncate">${tenant?.name || 'Loja Teste'}</p>
                    <p class="text-[10px] text-[#A0A0A0] truncate">${email}</p>
                </div>
            </div>
            <a href="/logout" class="block mt-6 text-[10px] font-black uppercase tracking-[0.2em] text-[#E53E3E] hover:opacity-70 transition-all">Sair da Conta</a>
        </div>
    </aside>

    <main class="ml-64 min-h-screen">
        <header class="flex justify-between items-center w-full px-12 h-20 bg-white/50 backdrop-blur-md sticky top-0 z-40">
            <div class="flex items-center gap-4">
                <div class="relative">
                    <span class="material-symbols-outlined absolute left-0 top-1/2 -translate-y-1/2 text-[#A0A0A0] text-lg">search</span>
                    <input class="bg-transparent border-none focus:ring-0 text-[10px] tracking-[0.2em] font-headline font-bold uppercase pl-8 w-64 placeholder-[#A0A0A0]" placeholder="BUSCAR LOOKS OU PRODUTOS..." type="text"/>
                </div>
            </div>
            <div class="flex items-center gap-6">
                <span class="material-symbols-outlined text-[#A0A0A0] cursor-pointer hover:text-[#1A1A1A]">notifications</span>
                <span class="material-symbols-outlined text-[#A0A0A0] cursor-pointer hover:text-[#1A1A1A]">settings</span>
            </div>
        </header>

        <div class="px-12 py-10 pb-20 max-w-[1600px]">
            ${renderSection(section, isSuperAdmin, isMock, healthData, tenant, isConnected, installation, recentJobs, allTenants, email, leads, analyticsData)}
        </div>
    </main>
</body>
</html>
      `;

      function renderSection(s: string, admin: boolean, mock: boolean, health: any, t: any, connected: boolean, inst: any, jobs: any[], tenantsList: any[], userEmail: string, leadsList: any[], analytics: any) {
          switch (s) {
              case 'dashboard':
                return `
                <section class="relative overflow-hidden rounded-[2.5rem] bg-white p-12 mb-12 shadow-sm border border-[#F0F0F0] group">
                    <div class="relative z-10 grid md:grid-cols-2 gap-12 items-center">
                        <div>
                            <span class="text-[9px] uppercase tracking-[0.4em] text-[#5F5E5E] mb-6 block font-black border-l-2 border-[#1A1A1A] pl-4 italic">Performance Inteligente</span>
                            <h2 class="text-5xl font-[800] font-headline tracking-tighter text-[#1A1A1A] leading-[1.1] mb-8 uppercase italic">Elevando sua Marca <br/>com Realismo IA</h2>
                            <div class="flex gap-12">
                                <div>
                                    <p class="text-4xl font-headline font-[800] text-[#1A1A1A] italic">R$ ${(analytics.conversions * 149).toLocaleString('pt-BR')}</p>
                                    <p class="text-[9px] text-[#A0A0A0] uppercase tracking-widest font-black mt-2">Vendas Assistidas</p>
                                </div>
                                <div class="w-px h-12 bg-[#F0F0F0]"></div>
                                <div>
                                    <p class="text-4xl font-headline font-[800] text-[#1A1A1A] italic">+${(parseFloat(analytics.successRate) / 4 || 0).toFixed(1)}%</p>
                                    <p class="text-[9px] text-[#A0A0A0] uppercase tracking-widest font-black mt-2">Conversão Real</p>
                                </div>
                            </div>
                        </div>
                        <div class="bg-[#F9F9F9] p-8 rounded-[2rem] border border-[#F0F0F0] shadow-sm">
                            <div class="flex justify-between items-center mb-6 px-2">
                                <p class="text-[9px] font-black uppercase tracking-widest text-[#1A1A1A]">Status do Provador</p>
                                <span class="px-3 py-1 bg-[#22C55E]/10 text-[#22C55E] text-[8px] font-black uppercase rounded-full">Sistema Online</span>
                            </div>
                            <div class="mb-6 bg-white p-6 rounded-2xl border border-[#F0F0F0]">
                                <div class="flex justify-between items-end mb-3">
                                    <p class="text-[9px] text-[#A0A0A0] uppercase font-black tracking-widest italic">Consumo Mensal</p>
                                    <p class="text-xs font-[800] italic tracking-tighter text-[#1A1A1A]">${t?.proofsUsedThisMonth || 0} / ${t?.proofsMonthlyLimit || 0}</p>
                                </div>
                                <div class="w-full h-1.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                                    <div class="h-full rounded-full bg-[#1A1A1A] transition-all duration-1000" style="width: ${Math.min(100, Math.round(((t?.proofsUsedThisMonth || 0) / (t?.proofsMonthlyLimit || 1)) * 100))}%"></div>
                                </div>
                            </div>
                            <div class="flex justify-between items-center bg-white p-5 rounded-2xl border border-[#F0F0F0]">
                                <div>
                                    <p class="text-2xl font-headline font-[800] italic text-[#1A1A1A] leading-none">${t?.proofsBalance || 0}</p>
                                    <p class="text-[8px] uppercase tracking-widest font-black text-[#A0A0A0] mt-1">Saldo Atual</p>
                                </div>
                                <a href="/?section=billing" class="px-6 py-3 bg-[#1A1A1A] text-white text-[9px] font-black uppercase tracking-widest rounded-xl hover:opacity-80 transition-all italic shadow-md shadow-black/10">Recarregar</a>
                            </div>
                        </div>
                    </div>
                </section>
                <section class="mb-12">
                    <div class="flex justify-between items-end mb-8 pl-2">
                        <div>
                            <h3 class="text-2xl font-[800] font-headline tracking-tighter uppercase italic leading-none">Galeria de Looks Recentes</h3>
                        </div>
                        <a href="/?section=tryon" class="text-[10px] font-black tracking-widest uppercase text-[#5F5E5E] border-b border-[#5F5E5E]/20 pb-1 hover:border-[#1A1A1A] transition-all italic">Ver Completa</a>
                    </div>
                    <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
                        ${jobs.slice(0, 4).map(j => `
                            <div class="group relative aspect-[3/4] overflow-hidden rounded-2xl bg-white border border-[#F0F0F0] shadow-sm hover:shadow-xl transition-all duration-500">
                                <img alt="Look" class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" src="${j.resultImageUrl || j.inputPersonUrl}"/>
                                <div class="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            </div>
                        `).join('')}
                    </div>
                </section>
                `;

            case 'tryon':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Galeria de Provas Virtuais</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Histórico completo de gerações e experimentos via IA.</p>
                </div>
                
                <div class="bg-white p-8 rounded-[2.5rem] border border-[#F0F0F0] shadow-sm mb-12 flex items-center gap-10">
                    <div class="w-20 h-20 rounded-2xl bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] shadow-inner text-[#1A1A1A]">
                        <span class="material-symbols-outlined !text-4xl text-[#1A1A1A]">auto_awesome</span>
                    </div>
                    <div class="flex-1 pr-10">
                        <div class="flex justify-between items-end mb-3">
                            <div>
                                <p class="text-[9px] text-[#A0A0A0] uppercase font-black tracking-[0.25em] mb-1">Capacidade de Processamento</p>
                                <p class="text-2xl font-[800] italic tracking-tighter text-[#1A1A1A]">Motor Atelier IA v2.4</p>
                            </div>
                            <p class="text-[10px] font-black uppercase text-[#1A1A1A] italic">75% Disponível</p>
                        </div>
                        <div class="w-full h-2.5 bg-[#F0F0F0] rounded-full overflow-hidden">
                            <div class="h-full rounded-full bg-[#1A1A1A] shadow-lg shadow-black/20" style="width: 25%"></div>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-2 md:grid-cols-4 gap-10">
                    ${jobs.length > 0 ? jobs.map(j => `
                        <div class="group bg-white rounded-[2.5rem] border border-[#F0F0F0] shadow-sm hover:shadow-2xl transition-all duration-700 overflow-hidden">
                            <div class="aspect-[3/4] overflow-hidden relative">
                                <img alt="Look" class="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" src="${j.resultImageUrl || j.userImageUrl || j.inputPersonUrl}"/>
                                <div class="absolute top-4 right-4 bg-[#22C55E] px-3 py-1 rounded-full shadow-lg">
                                    <p class="text-[8px] font-black uppercase tracking-widest text-white italic">DONE</p>
                                </div>
                            </div>
                            <div class="p-8">
                                <p class="text-[9px] font-black uppercase tracking-[0.3em] text-[#A0A0A0] italic">Preview Top</p>
                                <div class="flex justify-between items-center mt-2">
                                    <p class="text-[11px] font-[800] italic tracking-tight text-[#1A1A1A] uppercase">ID: #WF-${j.id.slice(0,6).toUpperCase()}</p>
                                    <span class="material-symbols-outlined text-xl text-[#D0D0D0] group-hover:text-[#1A1A1A] transition-colors cursor-pointer">open_in_new</span>
                                </div>
                            </div>
                        </div>
                    `).join('') : '<div class="col-span-full py-40 text-center bg-white rounded-[4rem] border border-dashed border-[#E0E0E0] uppercase text-[11px] font-[800] tracking-[0.4em] text-[#BABABA] italic">Nenhum look gerado ainda</div>'}
                </div>
                `;

            case 'analytics':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Análise de Performance</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Métricas reais e comportamento do usuário no atelier.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-10 mb-12">
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Taxa de Sucesso IA</p>
                            <p class="text-7xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${analytics.successRate}</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#A0A0A0] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6">Rede neural otimizada.</p>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Conversões Assistidas</p>
                            <p class="text-7xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${analytics.conversions}</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#A0A0A0] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6">Vendas influenciadas pelo look.</p>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Total de Provas</p>
                            <p class="text-7xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${analytics.totalJobsCount}</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#A0A0A0] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6">Volume total de interações.</p>
                    </div>
                </div>
                <div class="bg-white p-14 rounded-[4rem] border border-[#F0F0F0] shadow-sm">
                    <div class="flex justify-between items-center mb-16 pl-4">
                        <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]">Volume de Gerações Diárias</h3>
                        <span class="text-[9px] font-black uppercase tracking-[0.2em] text-[#A0A0A0] italic">Pulso 7 Dias</span>
                    </div>
                    <div class="flex items-end justify-between h-64 gap-6 px-4">
                        ${analytics.dailyUsage.slice(-14).map((d: any) => `
                            <div class="flex-1 flex flex-col items-center gap-8 group">
                                <div class="w-full bg-[#F5F5F5] rounded-full relative overflow-hidden group-hover:bg-[#1A1A1A] transition-all duration-700 ease-out min-h-[4px]" style="height: ${Math.max(2, (d.count / (Math.max(...analytics.dailyUsage.map((x: any) => x.count)) || 1)) * 100)}%"></div>
                                <span class="text-[8px] font-bold text-[#D0D0D0] uppercase tracking-tighter group-hover:text-[#1A1A1A] transition-colors">${d.date}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                `;

            case 'leads':
                return `
                <div class="flex justify-between items-end mb-12">
                    <div>
                        <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Gestão de Leads</h2>
                        <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Potenciais clientes que utilizaram o provador e salvaram looks.</p>
                    </div>
                    <button class="px-10 py-5 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.2em] rounded-2xl shadow-xl hover:opacity-80 transition-all italic">EXPORTAR CSV</button>
                </div>
                <div class="bg-white rounded-[3.5rem] p-12 border border-[#F0F0F0] shadow-sm">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-separate border-spacing-y-2">
                            <thead>
                                <tr class="text-[10px] font-[800] uppercase tracking-[0.3em] text-[#BABABA]">
                                    <th class="pb-8 pl-8">Nome / E-mail</th>
                                    <th class="pb-8 pl-4">WhatsApp</th>
                                    <th class="pb-8 pl-4 text-center">Origem</th>
                                    <th class="pb-8 pl-4 text-center">Data</th>
                                    <th class="pb-8 pr-8 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${leadsList.length > 0 ? leadsList.map(l => `
                                    <tr class="group hover:bg-[#F9F9F9] transition-all duration-300">
                                        <td class="py-10 pl-8 rounded-l-[2rem]">
                                            <div class="flex items-center gap-6">
                                                <div class="w-14 h-14 rounded-full bg-[#F5F5F5] border border-[#F0F0F0] flex items-center justify-center font-black text-[#A0A0A0] text-lg shadow-inner">${(l.name || 'L').charAt(0).toUpperCase()}</div>
                                                <div>
                                                    <p class="text-[13px] font-[800] uppercase tracking-tight text-[#1A1A1A] italic">${l.name || 'Anônimo'}</p>
                                                    <p class="text-[10px] font-black uppercase tracking-[0.2em] text-[#D0D0D0] mt-1.5">${l.email || 'null'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-10 pl-4">
                                            <p class="text-[13px] font-[800] italic tracking-tight text-[#1A1A1A] uppercase">${l.whatsapp || 'N/A'}</p>
                                        </td>
                                        <td class="py-10 pl-4 text-center">
                                            <span class="px-4 py-1.5 bg-[#1A1A1A]/5 text-[#1A1A1A] text-[8px] font-black uppercase rounded-xl border border-[#1A1A1A]/10 italic tracking-widest">${l.origin || 'WordPress'}</span>
                                        </td>
                                        <td class="py-10 pl-4 text-center text-[11px] font-[800] italic text-[#1A1A1A]">
                                            ${new Date(l.createdAt).toLocaleDateString('pt-BR')}
                                        </td>
                                        <td class="py-10 pr-8 text-right rounded-r-[2rem]">
                                            <div class="flex justify-end gap-3">
                                                <button class="px-6 py-3 border border-[#1A1A1A] bg-white rounded-xl text-[10px] font-black uppercase hover:bg-[#1A1A1A] hover:text-white transition-all italic tracking-[0.1em] flex items-center gap-2">
                                                    <span class="material-symbols-outlined text-lg">chat</span> WHATSAPP
                                                </button>
                                                <button class="w-12 h-12 flex items-center justify-center border border-[#F0F0F0] rounded-xl text-[#D0D0D0] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-all bg-white">
                                                    <span class="material-symbols-outlined text-xl">visibility</span>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" class="py-40 text-center uppercase text-[11px] font-[800] tracking-[0.4em] text-[#BABABA] italic opacity-50">Nenhum lead capturado ainda</td></tr>'}
                            </tbody>
                        </table>
                </div>
                `;

            case 'integration':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Ativação do Plugin</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Conecte seu site WordPress ao motor Atelier IA.</p>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-5 gap-12">
                    <div class="lg:col-span-3 bg-white p-14 rounded-[4rem] border border-[#F0F0F0] shadow-sm">
                        <div class="flex items-center gap-8 mb-16 pl-4">
                            <div class="w-16 h-16 rounded-[1.5rem] bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] shadow-inner text-[#1A1A1A]">
                                <span class="material-symbols-outlined text-3xl">vpn_key</span>
                            </div>
                            <div>
                                <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]">Credenciais de Conexão</h3>
                                <p class="text-[9px] font-bold text-[#A0A0A0] mt-1.5 uppercase italic">Use estes dados no seu plugin WordPress</p>
                            </div>
                        </div>
                        <div class="space-y-12">
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">URL Base da API</label>
                                <div class="relative group">
                                    <input type="text" readonly value="${DashboardController.APP_URL}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-black tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                    <button class="absolute right-6 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#1A1A1A] transition-all"><span class="material-symbols-outlined text-xl">content_copy</span></button>
                                </div>
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">ID da Loja (Tenant)</label>
                                <div class="relative group">
                                    <input type="text" readonly value="${t?.id}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-black tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                    <button class="absolute right-6 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#1A1A1A] transition-all"><span class="material-symbols-outlined text-xl">content_copy</span></button>
                                </div>
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Chave Pública</label>
                                <div class="relative group">
                                    <input type="text" readonly value="${t?.publicKey}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-black tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                    <button class="absolute right-6 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#1A1A1A] transition-all"><span class="material-symbols-outlined text-xl">content_copy</span></button>
                                </div>
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Token de Instalação</label>
                                <div class="relative group">
                                    <input type="text" readonly value="${t?.installToken || 'WF-TOKEN-PENDING'}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-black tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                    <button class="absolute right-6 top-1/2 -translate-y-1/2 text-[#D0D0D0] hover:text-[#1A1A1A] transition-all"><span class="material-symbols-outlined text-xl">content_copy</span></button>
                                </div>
                            </div>
                            <button class="text-[10px] font-black uppercase tracking-[0.2em] text-[#1A1A1A] hover:opacity-50 transition-all flex items-center gap-3 pl-4 italic">
                                <span class="material-symbols-outlined text-lg">refresh</span> Regenerar Token de Segurança
                            </button>
                        </div>
                    </div>
                    <div class="lg:col-span-2 space-y-10">
                        <div class="bg-white p-14 rounded-[4rem] border border-[#F0F0F0] shadow-sm flex flex-col items-center text-center">
                            <span class="material-symbols-outlined !text-6xl text-[#1A1A1A] mb-8">integration_instructions</span>
                            <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-2">Status da Ponte</h3>
                            <p class="text-[9px] font-bold text-[#A0A0A0] uppercase italic tracking-widest">Integração Digital Nativa</p>
                            
                            <div class="my-14 py-12 px-10 bg-[#F9F9F9] rounded-[2.5rem] border border-[#F0F0F0] shadow-inner w-full">
                                <h4 class="text-3xl font-[800] font-headline italic tracking-tighter text-[#1A1A1A] uppercase mb-1">Conexão Ativa</h4>
                                <p class="text-[9px] font-bold text-[#A0A0A0] uppercase italic tracking-widest leading-relaxed">Sua loja está online e operando<br/>com WeFashion IA</p>
                            </div>

                            <a href="/v1/plugin/download" class="w-full py-6 bg-[#1A1A1A] text-white flex items-center justify-center gap-5 rounded-[1.5rem] shadow-xl hover:opacity-80 transition-all group">
                                <span class="material-symbols-outlined text-2xl">download</span>
                                <span class="text-[10px] font-black uppercase tracking-[0.3em] italic">Baixar Core Plugin .zip</span>
                            </a>
                        </div>
                    </div>
                </div>
                `;

            case 'billing':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Assinatura e Planos</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Gestão de consumo e faturamento inteligente.</p>
                </div>
                <div class="bg-white rounded-[4rem] border border-[#F0F0F0] shadow-sm overflow-hidden mb-12 grid md:grid-cols-3">
                    <div class="md:col-span-2 p-16 flex flex-col justify-center">
                        <div class="flex justify-between items-end mb-6">
                            <div>
                                <p class="text-[9px] text-[#A0A0A0] uppercase font-black tracking-[0.3em] mb-2 italic">Status de Consumo</p>
                                <p class="text-3xl font-[800] italic tracking-tighter text-[#1A1A1A] uppercase leading-none">${t?.proofsUsedThisMonth || 0} de ${t?.proofsMonthlyLimit || 0} Provas <span class="text-[#BCBCBC] font-medium tracking-tight">/ mês</span></p>
                            </div>
                            <div class="text-right">
                                <p class="text-4xl font-[800] italic tracking-tighter text-[#1A1A1A] uppercase leading-none">${Math.max(0, (t?.proofsMonthlyLimit || 0) - (t?.proofsUsedThisMonth || 0))}</p>
                                <p class="text-[9px] text-[#A0A0A0] uppercase font-black tracking-[0.2em] mt-2 italic">Restantes</p>
                            </div>
                        </div>
                        <div class="w-full h-2.5 bg-[#F9F9F9] rounded-full overflow-hidden border border-[#F0F0F0] shadow-inner mb-6">
                            <div class="h-full rounded-full bg-[#1A1A1A] shadow-lg transition-all duration-1000" style="width: ${Math.round(((t?.proofsUsedThisMonth || 0) / (t?.proofsMonthlyLimit || 1)) * 100)}%"></div>
                        </div>
                        <p class="text-[9px] font-black uppercase tracking-[0.4em] text-[#BCBCBC] italic">${Math.round(((t?.proofsUsedThisMonth || 0) / (t?.proofsMonthlyLimit || 1)) * 100)}% Utilizado este ciclo</p>
                    </div>
                    <div class="bg-[#1A1A1A] p-16 text-white flex flex-col justify-between relative overflow-hidden group">
                        <div class="absolute -right-20 -top-20 w-64 h-64 bg-white/5 rounded-full blur-[80px] group-hover:bg-white/10 transition-all duration-1000"></div>
                        <div class="relative z-10">
                            <p class="text-[9px] font-black uppercase text-white/30 tracking-[0.4em] mb-10 border-l-2 border-white/10 pl-6 italic">Plano Atual</p>
                            <h3 class="text-6xl font-[800] font-headline italic uppercase tracking-tighter mb-4">${t?.plan || 'Free'}</h3>
                            <span class="px-5 py-2 bg-white/5 text-white/40 text-[9px] font-black uppercase tracking-[0.3em] rounded-xl border border-white/10 italic">Renovação Automática</span>
                        </div>
                        <div class="mt-14 space-y-4 relative z-10">
                            <button class="w-full py-5 border border-white/10 text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl hover:bg-white/5 transition-all italic">Gerenciar Assinatura</button>
                            <button class="w-full py-5 bg-white text-black text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl hover:scale-[1.02] transition-all italic shadow-2xl">Upgrade de Plano</button>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm group hover:shadow-2xl transition-all duration-500">
                        <div class="w-14 h-14 rounded-2xl bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] mb-8 text-[#1A1A1A] shadow-inner group-hover:scale-110 transition-transform">
                            <span class="material-symbols-outlined text-3xl">bolt</span>
                        </div>
                        <h4 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-4 italic">Comprar Provas</h4>
                        <p class="text-[10px] font-bold text-[#A0A0A0] uppercase leading-relaxed mb-8 italic tracking-wide">Precisa de escala imediata? Adicione pacotes de provas avulsas à sua conta.</p>
                        <button class="text-[10px] font-black uppercase tracking-[0.25em] text-[#1A1A1A] border-b border-[#1A1A1A]/10 pb-1.5 hover:border-[#1A1A1A] transition-all italic flex items-center gap-3 group/btn">Ver Pacotes <span class="material-symbols-outlined text-lg group-hover/btn:translate-x-2 transition-transform">arrow_forward</span></button>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm">
                        <div class="w-14 h-14 rounded-2xl bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] mb-8 text-[#1A1A1A] shadow-inner">
                            <span class="material-symbols-outlined text-3xl">calendar_month</span>
                        </div>
                        <h4 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-4 italic">Próximo Reset</h4>
                        <p class="text-4xl font-[800] italic tracking-tighter text-[#1A1A1A] uppercase mb-1">Dia 21</p>
                        <p class="text-[9px] font-black uppercase tracking-[0.2em] text-[#BCBCBC] italic">Próximo Ciclo de Renovação</p>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm group hover:shadow-2xl transition-all duration-500">
                        <div class="w-14 h-14 rounded-2xl bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] mb-8 text-[#1A1A1A] shadow-inner group-hover:rotate-12 transition-transform">
                            <span class="material-symbols-outlined text-3xl">description</span>
                        </div>
                        <h4 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-4 italic">Histórico</h4>
                        <p class="text-[10px] font-bold text-[#A0A0A0] uppercase leading-relaxed mb-8 italic tracking-wide">Acesse todas as faturas e notas fiscais geradas pela WeFashion IA.</p>
                        <button class="text-[10px] font-black uppercase tracking-[0.25em] text-[#1A1A1A] border-b border-[#1A1A1A]/10 pb-1.5 hover:border-[#1A1A1A] transition-all italic">Faturas e IDs</button>
                    </div>
                </div>
                `;

            case 'settings':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Configurações Gerais</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Gerenciamento de perfil e diretrizes da marca.</p>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-3 gap-12">
                    <div class="lg:col-span-2 bg-white p-14 rounded-[4rem] border border-[#F0F0F0] shadow-sm">
                        <div class="flex items-center gap-8 mb-16 pl-4">
                            <div class="w-16 h-16 rounded-[1.5rem] bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] shadow-inner text-[#1A1A1A]">
                                <span class="material-symbols-outlined text-3xl">store</span>
                            </div>
                            <div>
                                <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]">Perfil da Loja</h3>
                                <p class="text-[9px] font-bold text-[#A0A0A0] mt-1.5 uppercase italic">Identidade comercial e dados de contato</p>
                            </div>
                        </div>
                        <form id="form-settings" onsubmit="handleUpdateProfile(event)" class="space-y-10">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-10">
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Nome da Unidade</label>
                                    <input type="text" id="settings-name" value="${t?.name || ''}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30 transition-all">
                                </div>
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Domínio Oficial</label>
                                    <input type="text" id="settings-domain" placeholder="loja.com.br" value="${t?.domain || ''}" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30 transition-all">
                                </div>
                            </div>
                            <div class="pt-6">
                                <button type="submit" id="btn-settings" class="px-12 py-6 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[1.5rem] hover:opacity-80 transition-all italic shadow-xl shadow-black/10 flex items-center gap-4">
                                    <span class="material-symbols-outlined text-xl">save</span> Salvar Alterações
                                </button>
                                <div id="settings-fb" class="hidden mt-6 text-[9px] font-black uppercase tracking-widest italic"></div>
                            </div>
                        </form>
                    </div>
                    <div class="space-y-10">
                        <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col items-center text-center">
                            <div class="w-24 h-24 rounded-full bg-[#F5F5F5] border border-[#F0F0F0] flex items-center justify-center font-[800] text-[#1A1A1A] text-2xl italic shadow-inner mb-8">${t?.name?.charAt(0).toUpperCase() || 'L'}</div>
                            <h4 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-2 italic">Status da Conta</h4>
                            <p class="text-[9px] font-[600] text-[#22C55E] uppercase italic tracking-[0.2em] px-4 py-1.5 bg-[#22C55E]/5 rounded-full border border-[#22C55E]/10 mb-8 inline-block">Ativo & Verificado</p>
                            <div class="w-full h-px bg-[#F5F5F5] mb-8"></div>
                            <p class="text-[10px] font-bold text-[#A0A0A0] uppercase leading-relaxed italic tracking-wide">ID de Segurança:<br/><span class="text-[#1A1A1A] font-black break-all text-[9px]">${t?.id}</span></p>
                        </div>
                    </div>
                </div>
                <script>
                    async function handleUpdateProfile(e) {
                        e.preventDefault();
                        const btn = document.getElementById('btn-settings');
                        const fb = document.getElementById('settings-fb');
                        const name = document.getElementById('settings-name').value;
                        const domain = document.getElementById('settings-domain').value;

                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-xl">sync</span> SALVANDO...';
                        btn.disabled = true;

                        try {
                            const res = await fetch('/v1/tenant/profile', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, domain })
                            });
                            const data = await res.json();
                            fb.classList.remove('hidden');
                            fb.innerText = data.success ? 'CONFIGURAÇÕES SALVAS COM SUCESSO!' : 'ERRO AO SALVAR: ' + (data.error || 'OCORREU UM PROBLEMA');
                            fb.className = 'mt-6 text-[9px] font-black uppercase tracking-widest italic ' + (data.success ? 'text-[#22C55E]' : 'text-[#E53E3E]');
                            if (data.success) setTimeout(() => fb.classList.add('hidden'), 3000);
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO';
                            fb.className = 'mt-6 text-[9px] font-black uppercase tracking-widest italic text-[#E53E3E]';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-xl">save</span> SALVAR ALTERAÇÕES';
                            btn.disabled = false;
                        }
                    }
                </script>
                `;

            case 'products':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Produtos</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Gerenciamento de catálogo e sincronização de peças.</p>
                </div>
                <div class="bg-white rounded-[4rem] border border-[#F0F0F0] p-20 text-center flex flex-col items-center justify-center min-h-[600px] shadow-sm">
                    <div class="w-24 h-24 rounded-[2rem] bg-[#F9F9F9] border border-[#F0F0F0] flex items-center justify-center mb-10 text-[#D0D0D0]">
                        <span class="material-symbols-outlined !text-5xl">inventory_2</span>
                    </div>
                    <h3 class="text-2xl font-[800] font-headline italic uppercase tracking-tighter text-[#1A1A1A] mb-4">Catálogo em Processamento</h3>
                    <p class="text-[10px] font-bold text-[#A0A0A0] uppercase italic tracking-widest max-w-sm leading-relaxed mb-12">Estamos finalizando a integração dos seus produtos WordPress. Em breve você poderá gerenciar as peças IA por aqui.</p>
                    <div class="flex gap-4">
                        <div class="px-6 py-2 bg-[#F9F9F9] rounded-full border border-[#F0F0F0] text-[8px] font-black uppercase tracking-widest text-[#BCBCBC]">Sincronização 85%</div>
                        <div class="px-6 py-2 bg-[#F9F9F9] rounded-full border border-[#F0F0F0] text-[8px] font-black uppercase tracking-widest text-[#BCBCBC]">Beta Access</div>
                    </div>
                </div>
                `;

            case 'tenants':
                return `
                <div class="mb-12 flex justify-between items-end">
                    <div>
                        <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Gestão de Lojas</h2>
                        <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Gestão global de unidades e parceiros WeFashion.</p>
                    </div>
                    <button onclick="openCreateModal()" class="px-8 py-4 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-2xl hover:opacity-80 transition-all italic shadow-xl flex items-center gap-3">
                        <span class="material-symbols-outlined text-lg">add</span> Adicionar Nova Unidade
                    </button>
                </div>
                <div class="bg-white rounded-[3.5rem] p-12 border border-[#F0F0F0] shadow-sm relative">
                    <div class="flex justify-between items-center mb-12 pl-6 pr-2">
                        <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]">Unidades Ativas</h3>
                        <div class="flex gap-4">
                            <div class="px-6 py-2 bg-[#F9F9F9] rounded-full border border-[#F0F0F0] text-[8px] font-black uppercase tracking-widest text-[#1A1A1A] italic">Total: ${tenantsList.length}</div>
                        </div>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-separate border-spacing-y-2">
                            <thead>
                                <tr class="text-[10px] font-[800] uppercase tracking-[0.3em] text-[#BABABA]">
                                    <th class="pb-8 pl-8">ID da Unidade</th>
                                    <th class="pb-8 pl-4">Login / E-mail</th>
                                    <th class="pb-8 pl-4">Plano</th>
                                    <th class="pb-8 pl-4">Uso Mensal</th>
                                    <th class="pb-8 pr-8 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${tenantsList.map(item => `
                                    <tr class="group hover:bg-[#F9F9F9] transition-all duration-300">
                                        <td class="py-10 pl-8 rounded-l-[2rem]">
                                            <div class="flex items-center gap-6">
                                                <div class="w-14 h-14 rounded-xl bg-[#F5F5F5] border border-[#F0F0F0] flex items-center justify-center font-[800] text-[#1A1A1A] text-lg italic shadow-inner">${(item.name || 'L').charAt(0).toUpperCase()}</div>
                                                <div>
                                                    <p class="text-[13px] font-[800] uppercase tracking-tight text-[#1A1A1A] italic">${item.name}</p>
                                                    <p class="text-[9px] font-black uppercase tracking-[0.2em] text-[#D0D0D0] mt-1.5 break-all max-w-[150px]">${item.id}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-10 pl-4">
                                            <p class="text-[11px] font-[700] text-[#1A1A1A]">${item.users?.[0]?.email || 'N/A'}</p>
                                        </td>
                                        <td class="py-10 pl-4">
                                            <span class="px-4 py-1.5 ${item.status === 'suspended' ? 'bg-red-500 text-white' : 'bg-[#1A1A1A] text-white'} text-[9px] font-black uppercase rounded-xl italic tracking-widest leading-none">${item.plan}</span>
                                        </td>
                                        <td class="py-10 pl-4">
                                            <div class="flex flex-col gap-2">
                                                <p class="text-[11px] font-[800] italic tracking-tight text-[#1A1A1A] uppercase">${item.proofsUsedThisMonth} / ${item.proofsMonthlyLimit}</p>
                                                <div class="w-32 h-1 bg-[#F0F0F0] rounded-full overflow-hidden">
                                                    <div class="h-full bg-[#1A1A1A]" style="width: ${Math.min(100, (item.proofsUsedThisMonth / (item.proofsMonthlyLimit || 1)) * 100)}%"></div>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="py-10 pr-8 text-right rounded-r-[2rem]">
                                            <div class="flex justify-end gap-3">
                                                <button onclick='openManageModal(${JSON.stringify(item).replace(/'/g, "&#39;")})' class="w-10 h-10 flex items-center justify-center border border-[#F0F0F0] rounded-xl text-[#D0D0D0] hover:text-[#1A1A1A] hover:border-[#1A1A1A] transition-all bg-white" title="Gerenciar">
                                                    <span class="material-symbols-outlined text-xl">settings</span>
                                                </button>
                                                <a href="/v1/admin/impersonate/${item.id}" class="inline-flex items-center gap-3 px-6 py-3 border border-[#1A1A1A] bg-white rounded-xl text-[9px] font-black uppercase hover:bg-[#1A1A1A] hover:text-white transition-all italic tracking-widest">
                                                    <span class="material-symbols-outlined text-lg">login</span>
                                                </a>
                                            </div>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Modal Criar Unidade -->
                <div id="modal-create" class="fixed inset-0 z-[100] hidden">
                    <div class="absolute inset-0 bg-black/60 backdrop-blur-md" onclick="closeCreateModal()"></div>
                    <div class="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl p-16 animate-slide-left overflow-y-auto">
                        <div class="flex justify-between items-center mb-12">
                            <div>
                                <h3 class="text-4xl font-[800] font-headline tracking-tighter uppercase italic text-[#1A1A1A]">Nova Unidade</h3>
                                <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em] mt-2">Provisionamento de Loja e Admin</p>
                            </div>
                            <button onclick="closeCreateModal()" class="w-12 h-12 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-all text-[#BABABA] hover:text-[#1A1A1A]">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onsubmit="handleCreateTenant(event)" class="space-y-10">
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Nome da Loja</label>
                                <input type="text" id="create-name" required placeholder="NOME DA MARCA EX: ATELIER FASHION" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30">
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">E-mail Administrativo</label>
                                <input type="email" id="create-email" required placeholder="contato@loja.com.br" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30">
                            </div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Senha de Acesso</label>
                                <div class="relative">
                                    <input type="password" id="create-password" required placeholder="••••••••" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30">
                                    <button type="button" onclick="togglePasswordVisibility('create-password', this)" class="absolute right-6 top-1/2 -translate-y-1/2 text-[#BCBCBC] hover:text-[#1A1A1A] transition-colors">
                                        <span class="material-symbols-outlined text-xl">visibility</span>
                                    </button>
                                </div>
                            <div class="pt-8">
                                <button type="submit" id="btn-create" class="w-full py-6 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[1.5rem] hover:opacity-80 transition-all italic shadow-2xl flex items-center justify-center gap-4">
                                    <span class="material-symbols-outlined text-xl">rocket_launch</span> Criar e Provisionar Unidade
                                </button>
                            </div>
                            <div id="create-fb" class="hidden p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6"></div>
                        </form>
                    </div>
                </div>

                <!-- Modal Gerenciar Unidade -->
                <div id="modal-manage" class="fixed inset-0 z-[100] hidden">
                    <div class="absolute inset-0 bg-black/60 backdrop-blur-md" onclick="closeManageModal()"></div>
                    <div class="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl p-16 animate-slide-left overflow-y-auto">
                        <div class="flex justify-between items-center mb-12">
                            <div>
                                <h3 class="text-4xl font-[800] font-headline tracking-tighter uppercase italic text-[#1A1A1A]" id="manage-title">Gerenciar Loja</h3>
                                <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em] mt-2" id="manage-subtitle">Configurações de Plano e Direitos</p>
                            </div>
                            <button onclick="closeManageModal()" class="w-12 h-12 flex items-center justify-center rounded-full hover:bg-neutral-100 transition-all text-[#BABABA] hover:text-[#1A1A1A]">
                                <span class="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <form onsubmit="handleUpdateTenant(event)" class="space-y-10">
                            <input type="hidden" id="manage-id">
                            <div class="grid grid-cols-2 gap-8">
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Plano Ativo</label>
                                    <select id="manage-plan" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none appearance-none cursor-pointer uppercase italic">
                                        <option value="trial">TRIAL (GRÁTIS)</option>
                                        <option value="starter">STARTER</option>
                                        <option value="growth">GROWTH</option>
                                        <option value="pro">PRO ATELIER</option>
                                        <option value="premium">PREMIUM</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Status</label>
                                    <select id="manage-status" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none appearance-none cursor-pointer uppercase italic">
                                        <option value="active">ATIVO</option>
                                        <option value="suspended">SUSPENSO / INADIMPLENTE</option>
                                    </select>
                                </div>
                            </div>
                            <div class="grid grid-cols-2 gap-8">
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Saldo de Provas</label>
                                    <input type="number" id="manage-balance" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30">
                                    <p class="text-[8px] text-[#A0A0A0] mt-2 font-[600] uppercase italic">Saldo total disponível para uso imediato.</p>
                                </div>
                                <div>
                                    <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Limite Mensal</label>
                                    <input type="number" id="manage-limit" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30">
                                    <p class="text-[8px] text-[#A0A0A0] mt-2 font-[600] uppercase italic">Volume que reseta mensalmente.</p>
                                </div>
                            </div>
                            <div class="pt-8">
                                <button type="submit" id="btn-update" class="w-full py-6 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[1.5rem] hover:opacity-80 transition-all italic shadow-2xl flex items-center justify-center gap-4">
                                    <span class="material-symbols-outlined text-xl">save</span> Atualizar Contrato e Saldo
                                </button>
                            </div>

                            <!-- Seção de Segurança -->
                            <div class="pt-12 border-t border-[#F0F0F0] mt-12">
                                <h4 class="text-[10px] font-black uppercase tracking-[0.3em] text-[#1A1A1A] mb-8 italic">Segurança e Acesso</h4>
                                <div class="space-y-6">
                                    <div class="grid grid-cols-2 gap-8">
                                        <div>
                                            <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Novo E-mail de Login</label>
                                            <input type="email" id="manage-new-email" placeholder="manter atual" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                        </div>
                                        <div>
                                            <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 italic tracking-[0.3em]">Nova Senha</label>
                                            <div class="relative">
                                                <input type="password" id="manage-new-password" placeholder="••••••••" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none">
                                                <button type="button" onclick="togglePasswordVisibility('manage-new-password', this)" class="absolute right-6 top-1/2 -translate-y-1/2 text-[#BCBCBC] hover:text-[#1A1A1A] transition-colors">
                                                    <span class="material-symbols-outlined text-xl">visibility</span>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex gap-4">
                                        <button type="button" onclick="handleUpdateCredentials()" id="btn-creds" class="flex-1 py-5 bg-white border border-[#1A1A1A] text-[#1A1A1A] text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:bg-[#1A1A1A] hover:text-white transition-all italic flex items-center justify-center gap-3">
                                            <span class="material-symbols-outlined text-lg">lock_reset</span> Atualizar Acesso
                                        </button>
                                        <button type="button" onclick="handleSendResetEmail()" id="btn-reset-email" class="flex-1 py-5 bg-[#F9F9F9] border border-[#F0F0F0] text-[#BCBCBC] text-[9px] font-black uppercase tracking-[0.2em] rounded-xl hover:border-[#1A1A1A] hover:text-[#1A1A1A] transition-all italic flex items-center justify-center gap-3">
                                            <span class="material-symbols-outlined text-lg">mail</span> Enviar Recuperação
                                        </button>
                                    </div>
                                    <p class="text-[8px] text-[#A0A0A0] font-[600] uppercase italic text-center">A atualização manual de senha é imediata. O link de recuperação expira em 24h.</p>
                                </div>
                            </div>
                            <div id="manage-fb" class="hidden p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6"></div>
                        </form>
                    </div>
                </div>

                <style>
                    @keyframes slide-left {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    .animate-slide-left { animation: slide-left 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                </style>
                <script>
                    function togglePasswordVisibility(inputId, btn) {
                        const input = document.getElementById(inputId);
                        const icon = btn.querySelector('.material-symbols-outlined');
                        if (input.type === 'password') {
                            input.type = 'text';
                            icon.innerText = 'visibility_off';
                        } else {
                            input.type = 'password';
                            icon.innerText = 'visibility';
                        }
                    }

                    function openCreateModal() {
                        document.getElementById('modal-create').classList.remove('hidden');
                        document.body.style.overflow = 'hidden';
                    }
                    function closeCreateModal() {
                        document.getElementById('modal-create').classList.add('hidden');
                        document.body.style.overflow = '';
                        document.getElementById('create-fb').classList.add('hidden');
                    }
                    function openManageModal(tenant) {
                        document.getElementById('manage-id').value = tenant.id;
                        document.getElementById('manage-title').innerText = tenant.name;
                        document.getElementById('manage-plan').value = tenant.plan;
                        document.getElementById('manage-status').value = tenant.status;
                        document.getElementById('manage-balance').value = tenant.proofsBalance;
                        document.getElementById('manage-limit').value = tenant.proofsMonthlyLimit;
                        document.getElementById('modal-manage').classList.remove('hidden');
                        document.body.style.overflow = 'hidden';
                    }
                    function closeManageModal() {
                        document.getElementById('modal-manage').classList.add('hidden');
                        document.body.style.overflow = '';
                        document.getElementById('manage-fb').classList.add('hidden');
                    }

                    async function handleCreateTenant(e) {
                        e.preventDefault();
                        const btn = document.getElementById('btn-create');
                        const fb = document.getElementById('create-fb');
                        const name = document.getElementById('create-name').value;
                        const email = document.getElementById('create-email').value;
                        const password = document.getElementById('create-password').value;

                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> PROCESSANDO...';
                        btn.disabled = true;

                        try {
                            const res = await fetch('/v1/admin/tenants', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name, email, password })
                            });
                            const data = await res.json();
                            fb.classList.remove('hidden');
                            fb.innerText = data.success ? 'UNIDADE CRIADA COM SUCESSO! RECARREGANDO...' : 'ERRO: ' + (data.error || 'FALHA NA CRIAÇÃO');
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6 ' + (data.success ? 'bg-[#22C55E]/5 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20');
                            if (data.success) setTimeout(() => location.reload(), 1500);
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO COM O SERVIDOR';
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20 border italic tracking-widest mt-6';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-xl">rocket_launch</span> CRIAR E PROVISIONAR UNIDADE';
                            btn.disabled = false;
                        }
                    }

                    async function handleUpdateTenant(e) {
                        e.preventDefault();
                        const btn = document.getElementById('btn-update');
                        const fb = document.getElementById('manage-fb');
                        const id = document.getElementById('manage-id').value;
                        const plan = document.getElementById('manage-plan').value;
                        const status = document.getElementById('manage-status').value;
                        const proofsBalance = document.getElementById('manage-balance').value;
                        const proofsMonthlyLimit = document.getElementById('manage-limit').value;

                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> ATUALIZANDO...';
                        btn.disabled = true;

                        try {
                            const res = await fetch('/v1/admin/tenants/' + id, {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ plan, status, proofsBalance, proofsMonthlyLimit })
                            });
                            const data = await res.json();
                            fb.classList.remove('hidden');
                            fb.innerText = data.success ? 'CONTRATO ATUALIZADO COM SUCESSO!' : 'ERRO: ' + (data.error || 'FALHA NA ATUALIZAÇÃO');
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6 ' + (data.success ? 'bg-[#22C55E]/5 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20');
                            if (data.success) setTimeout(() => location.reload(), 1500);
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO COM O SERVIDOR';
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20 border italic tracking-widest mt-6';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-xl">save</span> ATUALIZAR CONTRATO E SALDO';
                            btn.disabled = false;
                        }
                    }

                    async function handleUpdateCredentials() {
                        const btn = document.getElementById('btn-creds');
                        const fb = document.getElementById('manage-fb');
                        const id = document.getElementById('manage-id').value;
                        const email = document.getElementById('manage-new-email').value;
                        const password = document.getElementById('manage-new-password').value;

                        if (!email && !password) {
                            alert('Informe um novo e-mail ou senha para atualizar.');
                            return;
                        }

                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">sync</span> PROCESSANDO...';
                        btn.disabled = true;
                        fb.classList.add('hidden');

                        try {
                            const res = await fetch('/v1/admin/tenants/' + id + '/credentials', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ email, password })
                            });
                            const data = await res.json();
                            fb.classList.remove('hidden');
                            fb.innerText = data.success ? 'ACESSO ATUALIZADO COM SUCESSO!' : 'ERRO: ' + (data.error || 'FALHA NA ATUALIZAÇÃO');
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6 ' + (data.success ? 'bg-[#22C55E]/5 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20');
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO';
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20 border italic tracking-widest mt-6';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-lg">lock_reset</span> ATUALIZAR ACESSO';
                            btn.disabled = false;
                        }
                    }

                    async function handleSendResetEmail() {
                        const btn = document.getElementById('btn-reset-email');
                        const fb = document.getElementById('manage-fb');
                        const id = document.getElementById('manage-id').value;

                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin text-lg">sync</span> ENVIANDO...';
                        btn.disabled = true;
                        fb.classList.add('hidden');

                        try {
                            const res = await fetch('/v1/admin/tenants/' + id + '/reset-password', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' }
                            });
                            const data = await res.json();
                            fb.classList.remove('hidden');
                            fb.innerText = data.success ? 'LINK ENVIADO COM SUCESSO VIA RESEND!' : 'ERRO: ' + (data.error || 'FALHA NO DISPARO');
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest mt-6 ' + (data.success ? 'bg-[#22C55E]/5 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20');
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO';
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20 border italic tracking-widest mt-6';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-lg">mail</span> ENVIAR RECUPERAÇÃO';
                            btn.disabled = false;
                        }
                    }
                </script>
                `;

            case 'marketing':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Central de Marketing</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Gestão de comunicação e disparos neurais.</p>
                </div>
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-12">
                    <div class="bg-white p-14 rounded-[4rem] border border-[#F0F0F0] shadow-sm">
                        <div class="flex items-center gap-8 mb-16 pl-4">
                            <div class="w-16 h-16 rounded-[1.5rem] bg-[#F9F9F9] flex items-center justify-center border border-[#F0F0F0] shadow-inner text-[#1A1A1A]">
                                <span class="material-symbols-outlined text-3xl">science</span>
                            </div>
                            <div>
                                <h3 class="text-[11px] font-black uppercase tracking-[0.3em] text-[#1A1A1A]">Testar Modelos</h3>
                                <p class="text-[9px] font-bold text-[#A0A0A0] mt-1.5 uppercase italic">Simular disparos de e-mail transacional</p>
                            </div>
                        </div>
                        <form onsubmit="sendTestEmail(event)" class="space-y-10">
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Template de E-mail</label>
                                <select id="test-template-id" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none appearance-none cursor-pointer">
                                    <option value="WELCOME">BOAS-VINDAS ATELIER</option>
                                    <option value="PAYMENT_APPROVED">PAGAMENTO APROVADO</option>
                                </select>
                            </div>
                            <div>
                                <label class="text-[9px] font-black uppercase text-[#BCBCBC] block mb-4 pl-4 italic tracking-widest leading-none">Destinatário de Teste</label>
                                <input type="email" id="test-to-email" required placeholder="dev@wefashion.marketing" class="w-full bg-[#F9F9F9] border border-[#F0F0F0] rounded-[1.5rem] p-6 text-[11px] font-[800] tracking-tight text-[#1A1A1A] shadow-inner focus:outline-none focus:border-[#1A1A1A]/30 transition-all">
                            </div>
                            <div class="pt-6">
                                <button type="submit" id="test-btn" class="w-full py-6 bg-[#1A1A1A] text-white text-[10px] font-black uppercase tracking-[0.3em] rounded-[1.5rem] hover:opacity-80 transition-all italic shadow-xl shadow-black/10 flex items-center justify-center gap-4">
                                    <span class="material-symbols-outlined text-xl">send</span> Disparar Teste Real
                                </button>
                            </div>
                            <div id="test-feedback" class="hidden p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest"></div>
                        </form>
                    </div>
                </div>
                <script>
                    async function sendTestEmail(e) {
                        e.preventDefault();
                        const btn = document.getElementById('test-btn');
                        const fb = document.getElementById('test-feedback');
                        const templateId = document.getElementById('test-template-id').value;
                        const to = document.getElementById('test-to-email').value;
                        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> ENVIANDO...';
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
                            fb.innerText = data.success ? 'SUCESSO: E-MAIL ENVIADO NOVO CICLO!' : 'ERRO: ' + (data.error || 'FALHA NO DISPARO');
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center border italic tracking-widest ' + (data.success ? 'bg-[#22C55E]/5 text-[#22C55E] border-[#22C55E]/20' : 'bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20');
                        } catch (err) {
                            fb.classList.remove('hidden');
                            fb.innerText = 'ERRO DE CONEXÃO COM O SERVIDOR';
                            fb.className = 'p-6 rounded-[1.5rem] text-[10px] font-black uppercase text-center bg-[#E53E3E]/5 text-[#E53E3E] border-[#E53E3E]/20 border italic tracking-widest';
                        } finally {
                            btn.innerHTML = '<span class="material-symbols-outlined text-xl">send</span> DISPARAR TESTE REAL';
                            btn.disabled = false;
                        }
                    }
                </script>
                `;

            case 'observability':
                return `
                <div class="mb-12">
                    <h2 class="text-5xl font-[800] font-headline tracking-tighter uppercase italic mb-2">Monitoramento</h2>
                    <p class="text-[10px] text-[#A0A0A0] font-black uppercase tracking-[0.3em]">Diagnóstico de infraestrutura e performance do motor.</p>
                </div>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-10">
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between group hover:shadow-2xl transition-all duration-500">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Tempo de Atividade</p>
                            <p class="text-5xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${Math.floor(health.uptime / 3600)}h ${Math.floor((health.uptime % 3600) / 60)}m</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#BCBCBC] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6 group-hover:text-[#1A1A1A] transition-colors">Sistema operacional ativo.</p>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between group hover:shadow-2xl transition-all duration-500">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Memória em Uso</p>
                            <p class="text-5xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${health.memory}</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#BCBCBC] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6 group-hover:text-[#1A1A1A] transition-colors">Consumo de alocação Node.js.</p>
                    </div>
                    <div class="bg-white p-12 rounded-[3.5rem] border border-[#F0F0F0] shadow-sm flex flex-col justify-between group hover:shadow-2xl transition-all duration-500">
                        <div>
                            <p class="text-[10px] font-black text-[#A0A0A0] uppercase tracking-[0.3em] mb-10 pl-1">Versão do Motor</p>
                            <p class="text-5xl font-[800] font-headline italic text-[#1A1A1A] tracking-tighter">${health.nodeVersion}</p>
                        </div>
                        <p class="text-[10px] font-[600] text-[#BCBCBC] mt-10 italic uppercase tracking-widest border-t border-[#F0F0F0] pt-6 group-hover:text-[#1A1A1A] transition-colors">Runtime de execução segura.</p>
                    </div>
                </div>
                `;

            default:
                return `<div class="p-20 text-center bg-white rounded-[3rem] border border-neutral-100 border-dashed uppercase text-[10px] font-black opacity-30">Seção em Desenvolvimento: ${s}</div>`;
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
          <a href="/" style="margin-top: 30px; text-decoration: none; background: #1a1a1a; color: white; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 14px;">Tentar Novamente</a>
        </div>
      `);
    }
  }
}
