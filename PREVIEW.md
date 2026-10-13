# Prévia local

1. Abra um terminal nesta pasta (`dashboard-web`).
2. Execute `node preview.mjs`.
3. Acesse `http://127.0.0.1:3000` no navegador.

O servidor de prévia escuta somente em `127.0.0.1`. Os lançamentos ficam no arquivo local `private-data.json`, ignorado pelo Git, e são lidos pelo endpoint local `/api/finance`; não são incluídos nos arquivos HTML, CSS ou JavaScript. Essa cópia é um retrato dos dados consultados na planilha para revisar a interface e os filtros. Atualizações da planilha não aparecem automaticamente.

Para publicar com dados atualizados, configure OAuth e credenciais no ambiente seguro do provedor de hospedagem, conforme o `README.md`. Não publique `private-data.json` nem preencha credenciais em arquivos versionados.
