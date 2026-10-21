# Evolução Pessoal — guia de instalação e uso de dados

Aplicativo desktop local (Windows 11, x64). Funciona sem internet; seus dados ficam só no seu computador.

## 1. Gerar o instalador

Requer Node.js e as dependências instaladas (`npm install`). Na pasta do projeto:

```
npm run dist
```

- Compila o aplicativo e gera o instalador NSIS x64.
- `npm run pack` gera apenas a pasta `release\win-unpacked` (sem instalador), útil para testes.
- Se `npm install` mudar a versão do Electron e o binário não for baixado, rode antes:
  `node node_modules\electron\install.js`.

## 2. Onde está o arquivo .exe

`release\Evolucao-Pessoal-Setup-1.0.0.exe` (dentro da pasta do projeto). A pasta `release` não vai para
controle de versão.

## 3. Instalar e abrir

1. Dê dois cliques em `Evolucao-Pessoal-Setup-1.0.0.exe`.
2. Escolha a pasta (ou mantenha a sugerida). A instalação é por usuário: não exige administrador.
3. Abra pelo menu Iniciar ou pelo atalho da área de trabalho: **Evolução Pessoal**.

O instalador não é assinado digitalmente (não há certificado de assinatura). Por isso o Windows SmartScreen
pode mostrar "O Windows protegeu seu computador" na primeira execução. Clique em **Mais informações → Executar
assim mesmo**. Isso é esperado para aplicativos sem assinatura; o arquivo é o que você mesmo gerou.

Não é necessário ter Node.js, Python ou qualquer outra ferramenta instalada para usar o aplicativo.

## 4. Onde ficam os dados

- Banco de dados: `%APPDATA%\evolucao-pessoal\evolucao.db`
  (normalmente `C:\Users\<você>\AppData\Roaming\evolucao-pessoal\evolucao.db`).
- Cópias de segurança automáticas (antes de restaurar ou importar):
  `%APPDATA%\evolucao-pessoal\backups-automaticos\`.

A aba **Dados e backup** mostra esses caminhos. A pasta de dados é a mesma tanto no aplicativo instalado
quanto em desenvolvimento, e é independente da pasta de instalação.

## 5. Fazer backup

Aba **Dados e backup → Criar backup…**

1. Escolha onde salvar (sugestão: Documentos ou um pendrive). Pastas temporárias do sistema são recusadas.
2. O aplicativo cria uma cópia consistente do banco, verifica a integridade e só então grava o arquivo final.
   Se o arquivo já existir, o Windows pergunta se deseja substituir.
3. A mensagem de sucesso mostra o caminho, o tamanho e o que foi salvo.

O backup é um arquivo SQLite completo (atividades, programações, registros, descansos e autoavaliações).

## 6. Restaurar um backup

Aba **Dados e backup → Escolher backup para restaurar…**

1. Escolha o arquivo `.db` do backup.
2. O aplicativo valida o arquivo (SQLite íntegro, do Evolução Pessoal, de versão compatível) e mostra o
   que há no backup e o que há nos dados atuais.
3. Marque a caixa de confirmação e clique em **Substituir meus dados e reiniciar**.

Garantias:
- Antes de substituir, é criada uma cópia de segurança dos dados atuais em `backups-automaticos`.
- O arquivo de backup escolhido nunca é alterado nem apagado.
- Backups de versões anteriores do aplicativo são atualizados com segurança; backups de versões **mais novas**
  são recusados.
- Se algo falhar na troca, o banco anterior é preservado/recuperado.
- Depois de restaurar, o aplicativo reinicia sozinho para carregar os dados.

## 7. Importar os dados do aplicativo antigo (Evolução 1%, Python)

Aba **Dados e backup → Analisar banco do app antigo…**

O banco antigo costuma estar em `C:\Users\<você>\.evolucao_1pct\evolucao.db` (o seletor já abre aí).

1. O aplicativo **só lê** o arquivo antigo (nunca o altera) e mostra uma prévia: indicadores encontrados,
   registros aproveitáveis, incompatíveis e já existentes, e os motivos de qualquer bloqueio.
2. Para cada indicador aproveitável você escolhe:
   - **Importar** (marcar);
   - **Tipo**: hábito ou habilidade (não existia no app antigo; não pode ser trocado depois);
   - **Meta diária**: obrigatória, informada por você (a meta antiga era calculada, +1%/dia, e não é importada);
   - **Situação dos registros importados**: concluída, parcialmente realizada, não realizada, ou "Não importar
     registros". O app antigo não tinha status e ele nunca é deduzido da quantidade.
3. Clique em **Importar selecionados** (ou **Cancelar** para não gravar nada).

O que é importado: nome, unidade, data de início (vira a data de criação) e as quantidades registradas em
cada data. **Não** são importados: valor inicial, direção (aumentar/diminuir), cor, curva ideal, metas
calculadas, sequência. Nenhuma nota de autoavaliação é criada.

Segurança:
- Um backup automático dos dados atuais é feito antes de importar.
- A importação é uma única transação: ou entra tudo, ou nada.
- Importar de novo não duplica nada: atividades já importadas são reconhecidas e só registros novos entram.
  Dados já existentes nunca são sobrescritos.
- Itens ambíguos (nome já em uso, sem unidade, início no futuro etc.) não são importados e a prévia explica
  por quê.

Atenção: os registros importados valem desde a data de início do indicador, com a meta que você informar.
Dias desde então sem registro contarão como "sem registro" nas estatísticas.

## 8. Atualizar o aplicativo sem perder dados

Rode o novo instalador (`Evolucao-Pessoal-Setup-<versão>.exe`) por cima da instalação existente, na mesma
pasta. Seus dados ficam em `%APPDATA%\evolucao-pessoal`, fora da pasta de instalação, e **não são
tocados**. Ao abrir, o aplicativo migra o banco automaticamente, se necessário. Desinstalar também não
apaga seus dados. Para garantir, faça um backup antes de atualizar.

Não há atualização automática nesta versão.

## 9. Limitações e avisos conhecidos

- Instalador sem assinatura digital (aviso do SmartScreen na primeira execução).
- Aplicativo com o ícone padrão do Electron (nenhum ícone próprio foi definido).
- Apenas Windows x64.
- Uma instância por vez; abrir outra apenas traz a janela existente para frente.
- Backups automáticos antes de restaurar/importar **não** são apagados sozinhos; limpe a pasta
  `backups-automaticos` quando quiser.
- Restaurar exige reiniciar o aplicativo (feito automaticamente).
- Atividades arquivadas e depois desarquivadas voltam a contar desde a criação nas métricas.
- A importação do app antigo usa metas e situações escolhidas por você; não há conversão automática.
- Dependências de desenvolvimento (ferramenta de empacotamento) têm 8 avisos moderados de `npm audit`
  sem correção disponível; não fazem parte do aplicativo instalado (ver `PROGRESSO.md`).
