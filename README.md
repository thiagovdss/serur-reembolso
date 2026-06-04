# Serur - Reembolso

Sistema interno para controle de clientes, atividades da equipe, distribuicao mensal, reembolsos, ferias, home office e documentos por cliente.

## Estrutura

- `index.html`: tela principal do sistema.
- `styles.css`: identidade visual inspirada na Serur.
- `app.js`: regras da interface, login e integracao com banco.
- `supabase-config.js`: configuracao do Supabase.
- `supabase-schema.sql`: criacao das tabelas e politicas do banco.

## Publicacao recomendada

Use:

- GitHub para guardar o codigo.
- Vercel para publicar o site.
- Supabase para login e banco de dados.

## 1. Criar o banco no Supabase

1. Acesse `https://supabase.com`.
2. Crie um projeto.
3. Abra `SQL Editor`.
4. Cole todo o conteudo de `supabase-schema.sql`.
5. Execute o script.

Depois, va em:

`Project Settings > API`

Copie:

- Project URL
- anon public key

## 2. Configurar o site

Abra `supabase-config.js` e troque:

```js
window.SERUR_SUPABASE = {
  url: "COLE_AQUI_A_URL_DO_SUPABASE",
  anonKey: "COLE_AQUI_A_ANON_KEY_DO_SUPABASE"
};
```

Pelos dados reais do seu projeto Supabase.

## 3. Configurar autenticacao

No Supabase, abra:

`Authentication > Providers > Email`

Para teste inicial, voce pode desativar a confirmacao obrigatoria por e-mail. Depois, para uso definitivo, o ideal e ativar confirmacao de e-mail ou criar usuarios diretamente pelo painel do Supabase.

## 4. Subir para o GitHub

Crie um repositorio no GitHub e envie estes arquivos.

Comandos sugeridos:

```bash
git init
git add .
git commit -m "Criar sistema Serur Reembolso"
git branch -M main
git remote add origin URL_DO_REPOSITORIO
git push -u origin main
```

## 5. Publicar na Vercel

1. Acesse `https://vercel.com`.
2. Clique em `Add New Project`.
3. Importe o repositorio do GitHub.
4. Framework: `Other`.
5. Build command: deixe vazio.
6. Output directory: deixe vazio ou use `.`.
7. Publique.

A Vercel vai gerar um link publico. Depois, se quiser, configure um dominio como:

`reembolso.serur.com.br`

## Observacoes de seguranca

O arquivo `supabase-config.js` usa a chave anon publica do Supabase. Isso e esperado em apps web. A protecao dos dados vem das politicas RLS do banco.

As politicas atuais permitem que qualquer usuario autenticado leia e edite as tabelas. Para uma fase inicial interna isso e simples e funcional. Em uma etapa posterior, da para criar perfis de permissao, como administrador, gestor e colaborador.
