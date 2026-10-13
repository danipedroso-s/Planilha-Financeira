# Dashboard financeiro

App web sem dependências de terceiros em tempo de execução. O navegador lê os dados pelo próprio backend. A planilha, os tokens OAuth e a senha não são gravados no código.

## Executar localmente

1. Instale Node.js 20 ou superior.
2. Copie o arquivo .env.example para .env e preencha os valores.
3. Configure uma conta Google OAuth com o escopo somente de leitura https://www.googleapis.com/auth/spreadsheets.readonly. O backend precisa de GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REFRESH_TOKEN. Para o fluxo OAuth e renovação do token, consulte https://developers.google.com/identity/protocols/oauth2/web-server.
4. Defina DASHBOARD_USER e uma senha forte em DASHBOARD_PASSWORD.
5. Informe o ID da planilha em SPREADSHEET_ID.
6. Execute node server.mjs nesta pasta e abra http://localhost:3000.

O servidor lê Base financeira!A4:K504 pelo endpoint https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get. A planilha deve permanecer privada e estar acessível à conta Google autorizada.

## Publicar na Vercel

O projeto usa os arquivos estáticos de `public/` e a função Node.js `api/finance.mjs`. `vercel.json` define a pasta publicada e os cabeçalhos de segurança. O endpoint lê `Base financeira!A4:K504` da planilha privada; `?refresh=1` força uma nova leitura em vez de usar o cache de até 60 segundos.

1. Importe o repositório Git na Vercel. Como a aplicação está dentro de `dashboard-web`, defina essa pasta como **Root Directory**.
2. Deixe **Framework Preset** como **Other**, sem comando de build; a saída estática é `public/`.
3. Antes de disponibilizar qualquer URL, em **Settings → Deployment Protection**, proteja **All Deployments** com **Vercel Authentication**. Isso mantém as prévias, a produção e a API acessíveis apenas a quem tiver acesso ao projeto.
4. Em **Settings → Environment Variables**, cadastre para Preview e Production: `SPREADSHEET_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_REFRESH_TOKEN`. Marque os valores de credenciais como **Sensitive**. Use um OAuth com escopo somente de leitura e garanta que a conta autorizada tenha acesso à planilha.
5. Gere uma prévia protegida, confira os dados e teste **Atualizar**. Depois, publique a branch de produção mantendo a proteção ativa.

O backend renova o token Google quando necessário e mantém os dados em memória por até 60 segundos. A aplicação não altera a planilha e não grava lançamentos no navegador. Nunca envie `.env`, `private-data.json`, tokens, senhas ou dados financeiros ao repositório. A cópia local `private-data.json` serve apenas para a prévia offline; ela não é usada pela função da Vercel.

O servidor `server.mjs` usa `DASHBOARD_USER` e `DASHBOARD_PASSWORD` para a autenticação Basic local. Na Vercel, proteja o projeto inteiro com Vercel Authentication, inclusive a API.

| Variável | Uso |
| --- | --- |
| PORT | Porta do servidor local; padrão 3000. |
| DASHBOARD_USER | Usuário de acesso ao servidor local. |
| DASHBOARD_PASSWORD | Senha do servidor local. |
| SPREADSHEET_ID | ID da planilha Google. |
| GOOGLE_CLIENT_ID | ID OAuth do backend. |
| GOOGLE_CLIENT_SECRET | Segredo OAuth do backend. |
| GOOGLE_REFRESH_TOKEN | Token de atualização OAuth com permissão de leitura da planilha. |
