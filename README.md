# 🔥 F.O.G.O. · Mapa Operacional

**Inventário Inteligente da Cidade**: 1ª parte do DSIN Coder Challenge 2026.

A tela inicial não é uma tabela: é um **mapa operacional interativo** da cidade, com radares, câmeras, viaturas,
patinetes, totens, agentes e demais dispositivos posicionados onde estão. O mapa deixa de ser apenas visualização e
passa a ser o **ponto de partida das operações**: dele se filtra, se consulta a ficha de um equipamento, se altera
sua situação e se cadastra um novo equipamento clicando no local de instalação.

## Stack

| Camada   | Tecnologias                                                  |
| -------- | ------------------------------------------------------------ |
| Backend  | Node 22, Express 5, TypeScript, Prisma, SQLite, Zod          |
| Frontend | React 19, Vite, React Router, Leaflet + leaflet.heat, Lucide |
| Infra    | npm workspaces (monorepo), endpoint `/metrics` Prometheus    |

## Como rodar

```bash
npm run setup   # instala dependências, cria o banco e popula com dados de exemplo (Marília/SP)
npm run dev     # API em http://localhost:3333 e web em http://localhost:5173
```

Outros comandos úteis (rodar dentro de `server/` ou com `-w server`): `db:reset`, `db:seed`, `db:studio`.

### Com Docker

```bash
docker compose up -d --build   # web em http://localhost:8080 e API em http://localhost:3333
```

- **server**: aplica as migrations na inicialização e, quando o banco ainda não existe, roda o seed. O SQLite fica
  no volume `db-data`, então os dados sobrevivem a restarts e rebuilds.
- **web**: build estático do Vite servido pelo nginx, que encaminha `/api` e `/metrics` para o `server`.
- Variáveis opcionais: `WEB_PORT` (padrão `8080`), `API_PORT` (padrão `3333`) e `SEED_ON_START=true` para
  recriar os dados de exemplo ao subir.
- Recomeçar do zero: `docker compose down -v` (apaga o volume do banco).

## Mapa operacional

- **Ícone por categoria**: radar, câmera, balança, cancela, totem, patinete, viatura, moto, transporte etc.
  Agentes aparecem como pinos quadrados, com o ícone da sua função.
- **Cor pelo estado operacional**: Crítico, Alerta, Atenção, Normal, Pendente e Inativo. Os críticos pulsam.
- **Filtros** por bairro, tipo, urgência, situação e busca textual (série, rua, referência).
- **Camadas** independentes: equipamentos, agentes e **calor de falhas**, que mostra as regiões com maior
  concentração de falhas a partir do histórico de eventos e das falhas ativas.
- **Ficha lateral** ao clicar em um ponto, com ação rápida de mudança de situação e atalhos para a ficha completa.
- **Cadastrar no mapa**: clique no local e o formulário abre com as coordenadas preenchidas.

## Estrutura

```
server/
  prisma/              schema, migrations e seed (Marília/SP, com histórico de falhas)
  src/
    domain/            regras de negócio puras
      status.ts          máquina de estados da situação
      urgency.ts         nível de urgência operacional (cores do mapa)
      dynamic-attributes.ts  validação de atributos por tipo
    modules/           rotas HTTP por contexto
      map/               dados do mapa operacional + pontos de calor
      equipment-types/   tipos com atributos dinâmicos
      equipments/        inventário, troca de situação, manutenção
      agents/            agentes de trânsito, guardas e policiais
      dashboard/         indicadores consolidados
      cep/               proxy do ViaCEP
      metrics/           exportador no formato Prometheus
web/
  src/
    pages/             Mapa operacional, Indicadores, Equipamentos, Ficha, Agentes
    components/        mapa, camada de calor, badges, ícones, campos dinâmicos
```

## Diferenciais técnicos

- **Tipos dinâmicos**: cada tipo de equipamento define seus próprios campos (`attributesSchema`), validados em
  tempo de execução. Novos tipos ("entre outros") não exigem alteração de código.
- **Máquina de estados**: a situação só muda por transições válidas (ex.: um equipamento _furtado_ não volta direto a
  _operacional_). Mau funcionamento gera manutenção imediata; ao voltar a operar, a próxima manutenção periódica é
  reprogramada automaticamente.
- **Histórico de eventos**: toda mudança gera um evento imutável, com agente responsável e observação. É ele que
  alimenta a camada de calor de falhas.
- **Pronto para o PROMETHEUS**: `GET /metrics` expõe o inventário no formato de exposição do Prometheus.
- **Cadastro assistido**: CEP preenche o endereço (ViaCEP); coordenadas vêm do clique no mapa ou do GPS do dispositivo.

## API

| Método | Rota                              | Descrição                                   |
| ------ | --------------------------------- | ------------------------------------------- |
| GET    | `/api/map`                        | Equipamentos, agentes e pontos de calor     |
| GET    | `/api/dashboard`                  | Indicadores por urgência, situação e tipo   |
| GET    | `/api/equipment-types`            | Tipos e seus atributos                      |
| POST   | `/api/equipment-types`            | Cria tipo (com `attributesSchema`)          |
| GET    | `/api/equipments`                 | Filtros: `q`, `typeId`, `status`, `district`, `urgency` |
| GET    | `/api/equipments/:id`             | Ficha (eventos + transições possíveis)      |
| POST   | `/api/equipments`                 | Cadastra equipamento                        |
| PUT    | `/api/equipments/:id`             | Atualiza dados (exceto situação)            |
| POST   | `/api/equipments/:id/status`      | Altera situação (máquina de estados)        |
| POST   | `/api/equipments/:id/maintenance` | Agenda manutenção                           |
| GET    | `/api/agents`                     | Filtros: `role`, `active`, `q`              |
| POST   | `/api/agents`                     | Cadastra agente (com posição no mapa)       |
| PUT    | `/api/agents/:id`                 | Atualiza agente                             |
| GET    | `/api/cep/:cep`                   | Consulta endereço no ViaCEP                 |
| GET    | `/metrics`                        | Métricas no formato Prometheus              |
