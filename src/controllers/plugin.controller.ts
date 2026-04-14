import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

export class PluginController {
    /**
     * Serves the official plugin ZIP file to authenticated tenants with active subscriptions.
     */
    public static async downloadPlugin(req: Request, res: Response) {
        if (!req.user || !req.user.tenantId) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        try {
            const tenant = await prisma.tenant.findUnique({
                where: { id: req.user.tenantId }
            });

            if (!tenant) {
                return res.status(404).json({ error: 'Tenant não encontrado' });
            }

            // check access (optional but recommended: trial or active)
            const hasAccess = ['active', 'trialing'].includes(tenant.subscriptionStatus) || tenant.plan !== 'free';
            
            // For now, let's allow trial/active or if superadmin. 
            // Superadmins don't usually have tenantId in the same way, but let's be safe.
            if (!hasAccess && req.user.role !== 'super_admin') {
               return res.status(403).json({ error: 'Download disponível apenas para assinantes ativos.' });
            }

            const fileName = 'virtual-try-on-1.0.1.zip';
            const filePath = path.join(process.cwd(), 'public', 'assets', fileName);

            if (!fs.existsSync(filePath)) {
                return res.status(404).json({ error: 'Arquivo do plugin não encontrado no servidor.' });
            }

            // Log the download event
            await prisma.integrationLog.create({
                data: {
                    tenantId: tenant.id,
                    level: 'info',
                    action: 'plugin_download',
                    message: `Plugin v1.0.1 baixado por ${req.user.email}`
                }
            });

            return res.download(filePath, fileName);
        } catch (error) {
            console.error('Error downloading plugin:', error);
            return res.status(500).json({ error: 'Erro interno ao processar download.' });
        }
    }

    /**
     * Simple endpoint to verify connectivity from the dashboard.
     */
    public static async testConnection(req: Request, res: Response) {
        if (!req.user || !req.user.tenantId) {
            return res.status(401).json({ error: 'Não autenticado' });
        }

        try {
            const installation = await prisma.pluginInstallation.findFirst({
                where: { tenantId: req.user.tenantId },
                orderBy: { lastConnectedAt: 'desc' }
            });

            if (!installation) {
                return res.json({ 
                    connected: false, 
                    message: 'Nenhuma instalação detectada para este tenant.' 
                });
            }

            const isRecent = (Date.now() - new Date(installation.lastConnectedAt).getTime()) < 1000 * 60 * 60; // 1 hour

            return res.json({
                connected: installation.status === 'connected',
                lastCommunication: installation.lastConnectedAt,
                siteUrl: installation.siteUrl,
                pluginVersion: installation.pluginVersion,
                isRecent
            });
        } catch (error) {
            return res.status(500).json({ error: 'Erro ao testar conexão.' });
        }
    }

    /**
     * Registra ou atualiza uma instalação de plugin WordPress.
     */
    public static async register(req: Request, res: Response) {
        const { tenantId, publicKey, installToken, siteUrl, pluginVersion } = req.body;

        if (!tenantId || !publicKey || !installToken || !siteUrl) {
            return res.status(400).json({ error: 'Parâmetros incompletos para registro.' });
        }

        try {
            // 1. Validar Tenant e Token
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId }
            });

            if (!tenant || tenant.publicKey !== publicKey || tenant.installToken !== installToken) {
                return res.status(403).json({ error: 'Credenciais de instalação inválidas.' });
            }

            // 2. Criar ou Atualizar Instalação
            const installation = await prisma.pluginInstallation.upsert({
                where: { id: tenantId }, // Usando tenantId como ID único de instalação para simplificar
                update: {
                    siteUrl,
                    pluginVersion,
                    status: 'connected',
                    lastConnectedAt: new Date()
                },
                create: {
                    id: tenantId,
                    tenantId: tenant.id,
                    siteUrl,
                    pluginVersion,
                    status: 'connected'
                }
            });

            // 3. Logar evento
            await prisma.integrationLog.create({
                data: {
                    tenantId: tenant.id,
                    level: 'info',
                    action: 'plugin_registered',
                    message: `Plugin registrado com sucesso para o site: ${siteUrl}`
                }
            });

            return res.json({
                success: true,
                message: 'Plugin registrado com sucesso!',
                installationId: installation.id
            });
        } catch (error) {
            console.error('Erro no registro do plugin:', error);
            return res.status(500).json({ error: 'Erro interno ao registrar plugin.' });
        }
    }
}
