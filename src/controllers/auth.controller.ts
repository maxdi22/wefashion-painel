import { Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_mode';

export class AuthController {
  /**
   * Renderiza a tela de Login
   */
  public static async getLogin(req: Request, res: Response) {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;

    const html = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login | WeFashion Central</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --primary: #1A1A1A;
            --surface: #F8F8F8;
            --surface-container: #EEEEEE;
        }
        body { 
            font-family: 'Inter', sans-serif;
            background-color: var(--surface);
        }
        .font-headline { font-family: 'Outfit', sans-serif; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
    <!-- Decorative background elements -->
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"></div>
    <div class="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"></div>

    <div class="w-full max-w-[480px] relative z-10">
        <div class="text-center mb-12">
            <h1 class="text-2xl font-headline font-black tracking-tighter text-[#1A1A1A] uppercase">WeFashion</h1>
            <p class="text-[10px] uppercase tracking-[0.4em] text-[#5F5E5E] mt-2 font-bold italic">Digital Atelier Central</p>
        </div>

        <div class="bg-white p-12 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-neutral-100">
            <div class="mb-10">
                <h2 class="text-3xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] uppercase leading-none mb-2">Login Master</h2>
                <p class="text-xs text-[#5F5E5E] font-medium tracking-wide">Acesse sua suite de inteligência digital.</p>
            </div>

            <div id="errorMessage" class="hidden mb-8 p-4 bg-error/10 border border-error/20 text-error text-[10px] font-bold uppercase tracking-widest rounded-xl text-center"></div>

            <form id="loginForm" class="space-y-8">
                <div class="space-y-2">
                    <label class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 block ml-1 italic">Protocolo E-mail</label>
                    <div class="relative group">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">alternate_email</span>
                        <input type="email" id="email" name="email" value="maxdi.agency@gmail.com" required 
                            class="w-full bg-surface border border-neutral-100 p-5 pl-12 rounded-2xl text-sm font-bold tracking-widest text-[#1A1A1A] focus:border-primary outline-none transition-all placeholder:text-neutral-300"
                            placeholder="DIRETOR@EMPRESA.COM">
                    </div>
                </div>

                <div class="space-y-2">
                    <label class="text-[10px] font-black uppercase tracking-[0.2em] text-neutral-400 block ml-1 italic">Chave de Acesso</label>
                    <div class="relative group">
                        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-neutral-300 group-focus-within:text-primary transition-colors">lock_person</span>
                        <input type="password" id="password" name="password" value="password123" required 
                            class="w-full bg-surface border border-neutral-100 p-5 pl-12 rounded-2xl text-sm font-bold tracking-widest text-[#1A1A1A] focus:border-primary outline-none transition-all placeholder:text-neutral-300"
                            placeholder="••••••••">
                    </div>
                </div>

                <div class="pt-4">
                    <button type="submit" id="submitBtn" class="w-full py-6 bg-[#1A1A1A] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 shadow-xl">
                        <span>Autenticar no Atelier</span>
                        <div id="loader" class="hidden w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                    </button>
                </div>
            </form>

            <div class="mt-12 pt-8 border-t border-neutral-50 text-center">
                <p class="text-[10px] font-bold text-neutral-300 uppercase tracking-widest italic mb-4">Plataforma Exclusiva</p>
                <a href="/register" class="text-[10px] font-black text-[#1A1A1A] uppercase tracking-[0.2em] hover:text-primary transition-all">Solicitar Acesso à Central</a>
            </div>
        </div>

        <div class="text-center mt-12 flex justify-center gap-8">
            <a href="#" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:text-primary transition-all">Suporte</a>
            <a href="#" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:text-primary transition-all">Privacidade</a>
            <a href="#" class="text-[9px] font-bold text-neutral-400 uppercase tracking-widest hover:text-primary transition-all">Legal</a>
        </div>
    </div>

    <script>
        const loginForm = document.getElementById('loginForm');
        const errorMessage = document.getElementById('errorMessage');
        const submitBtn = document.getElementById('submitBtn');
        const loader = document.getElementById('loader');

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            errorMessage.classList.add('hidden');
            submitBtn.disabled = true;
            loader.classList.remove('hidden');

            try {
                const res = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (!res.ok) throw new Error(data.error || 'Falha na autenticação');

                // Cookie config
                const expires = new Date();
                expires.setDate(expires.getDate() + 7);
                document.cookie = 'token=' + data.token + '; expires=' + expires.toUTCString() + '; path=/';

                window.location.href = '/';

            } catch (err) {
                errorMessage.textContent = err.message || 'Erro crítico de acesso';
                errorMessage.classList.remove('hidden');
                submitBtn.disabled = false;
                loader.classList.add('hidden');
            }
        });
    </script>
</body>
</html>
    `;

    res.send(html);
  }

  /**
   * Renderiza a tela de Registro
   */
  public static async getRegister(req: Request, res: Response) {
      const html = `
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Registro | WeFashion</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --primary: #1A1A1A;
            --surface: #F8F8F8;
        }
        body { 
            font-family: 'Inter', sans-serif;
            background-color: var(--surface);
        }
        .font-headline { font-family: 'Outfit', sans-serif; }
    </style>
</head>
<body class="min-h-screen flex items-center justify-center p-6 relative overflow-hidden">
    <div class="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]"></div>
    
    <div class="w-full max-w-[480px] relative z-10">
        <div class="bg-white p-12 rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] border border-neutral-100 text-center">
            <div class="mb-10 flex justify-center">
                <div class="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center text-error">
                    <span class="material-symbols-outlined text-4xl">lock</span>
                </div>
            </div>
            
            <h2 class="text-3xl font-headline font-extrabold tracking-tighter text-[#1A1A1A] uppercase leading-none mb-6">Acesso Privado</h2>
            <p class="text-sm text-[#5F5E5E] font-medium leading-relaxed mb-10">
                A WeFashion opera em um ecossistema exclusivo. <br>
                Novos registros são processados apenas via convite direto ou aprovação comercial.
            </p>
            
            <div class="space-y-4">
                <a href="mailto:comercial@wefashion.com" class="block w-full py-5 bg-[#1A1A1A] text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:scale-[1.02] transition-all">Contatar Comercial</a>
                <a href="/login" class="block w-full py-5 bg-surface text-neutral-400 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] hover:text-[#1A1A1A] transition-all">Voltar para o Login</a>
            </div>
        </div>
    </div>
</body>
</html>
      `;
      res.send(html);
  }

  /**
   * Logout
   */
  public static async logout(req: Request, res: Response) {
      res.clearCookie('token');
      res.clearCookie('sb-access-token'); // Clear legacy if exists
      res.redirect('/login');
  }

  /**
   * API: Login gerando JWT
   * POST /auth/login
   */
  public static async loginApi(req: Request, res: Response) {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    try {
      // Usa Supabase apenas como validador de hash de senha (Identity Provider)
      const { data: { user }, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error || !user) {
        return res.status(401).json({ error: 'Credenciais inválidas' });
      }

      // Buscar perfil 
      const profile = await prisma.profile.findUnique({
        where: { id: user.id }
      });

      if (!profile) {
        return res.status(403).json({ error: 'Perfil de usuário não encontrado' });
      }

      // Gerar Custom JWT
      const tokenPayload = {
        id: user.id,
        email: user.email,
        role: profile.role,
        tenantId: profile.tenantId
      };

      const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '7d' });

      return res.status(200).json({
        success: true,
        message: 'Login realizado com sucesso',
        token,
        user: tokenPayload
      });

    } catch (err: any) {
      console.error('[Auth] Login Error Details:', {
        message: err.message,
        stack: err.stack,
        code: err.code
      });
      return res.status(500).json({ error: 'Erro interno no servidor de autenticação' });
    }
  }

  /**
   * API: Register
   * POST /auth/register
   */
  public static async registerApi(req: Request, res: Response) {
    // Como a plataforma é fechada, rejeitamos registros abertos
    return res.status(403).json({ error: 'Registros abertos estão desabilitados na WeFashion. Contate suporte comercial.' });
  }

  /**
   * API: Mudar Senha
   * POST /auth/change-password
   */
  public static async changePassword(req: Request, res: Response) {
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      return res.status(400).json({ error: 'Ambos os campos de senha são obrigatórios' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'As senhas não coincidem' });
    }

    try {
      // O Supabase lida com o usuário logado via sessão se estivermos num contexto de browser,
      // mas aqui estamos usando JWT customizado. No entanto, o middleware authenticateUser
      // coloca o usuário em req.user.
      // Para mudar a senha no Supabase via Admin ou via Auth comum, precisamos do token de acesso ou usar a admin API.
      // Como estamos em modo dev/mock, vamos usar a API de Auth do Supabase com o token do usuário se disponível,
      // ou apenas simular se for o caso.
      
      const { data, error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) throw error;

      return res.json({ success: true, message: 'Senha alterada com sucesso.' });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || 'Erro ao alterar senha.' });
    }
  }
}
