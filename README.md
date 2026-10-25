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
npm run dev     # API em http://localhost:3333, web em http://localhost:5173 e o simulador da cidade
```

Outros comandos úteis (rodar dentro de `server/` ou com `-w server`): `db:reset`, `db:seed`, `db:studio`.

### Simulador da cidade

`npm run simulate` faz o papel dos dispositivos IoT e das equipes em campo, enviando telemetria e posições pelos
mesmos endpoints que o PROMETHEUS usaria (já roda junto com `npm run dev`). De tempos em tempos provoca incidentes:
dispositivo que para de responder, leitura anômala (câmera sem imagem, totem sem papel, patinete sem bateria) e
agente sem sinal. Três dispositivos ficam permanentemente mudos, para a falha silenciosa estar sempre visível.
Variáveis opcionais: `API_URL` (padrão `http://localhost:3333`), `TICK_MS` (padrão `10000`) e `INCIDENT_CHANCE`
(chance de incidente por ciclo, padrão `0.04`).

### Com Docker

```bash
docker compose up -d --build   # web em http://localhost:8080 e API em http://localhost:3333
```

- **server**: aplica as migrations na inicialização e, quando o banco ainda não existe, roda o seed. O SQLite fica
  no volume `db-data`, então os dados sobrevivem a restarts e rebuilds.
- **web**: build estático do Vite servido pelo nginx, que encaminha `/api` e `/metrics` para o `server`.
- **simulator**: o simulador da cidade, apontando para o `server`. Para desligar: `docker compose stop simulator`.
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
- **Motor de alertas**: a cada 30 s (e logo após cada mudança feita pelo operador) as regras são reavaliadas sobre o
  estado da cidade: furto, falha reportada, equipamento sem comunicação, manutenção vencida ou próxima, agente sem
  sinal, leitura de telemetria fora dos limites e região com disponibilidade abaixo de 80%. O alerta abre sozinho, muda de gravidade se a situação piorar e
  se resolve sozinho quando a condição deixa de existir; o operador apenas o reconhece.
- **Disponibilidade real**: conta os equipamentos instalados que estão operando _e_ comunicando. Um equipamento
  "operacional" que parou de enviar telemetria conta como indisponível, mesmo que ninguém tenha registrado a falha.
- **Visão por região**: os bairros são agrupados em regiões, e cada região recebe um nível de saúde: _crítico_ (alerta
  crítico aberto ou disponibilidade abaixo de 60%), _atenção_ (alerta de gravidade alta ou disponibilidade abaixo de
  80%) ou _normal_. A disponibilidade da cidade e de cada região é registrada a cada 15 min para o gráfico histórico.
- **Pronto para o PROMETHEUS**: `GET /metrics` expõe o inventário, os alertas abertos e a disponibilidade por região
  no formato de exposição do Prometheus.
- **Cadastro assistido**: CEP preenche o endereço (ViaCEP); coordenadas vêm do clique no mapa ou do GPS do dispositivo.

## API

| Método | Rota                              | Descrição                                   |
| ------ | --------------------------------- | ------------------------------------------- |
| GET    | `/api/map`                        | Equipamentos, agentes (com a região de cada um), regiões e pontos de calor |
| GET    | `/api/dashboard`                  | Disponibilidade, agentes em atividade, alertas, conectividade e composição da rede |
| GET    | `/api/regions`                    | Visão consolidada por região, das que exigem atenção para as normais |
| GET    | `/api/regions/history`            | Histórico de disponibilidade (`regionId` opcional; sem ele, a cidade) por `hours` (padrão 24) |
| GET    | `/api/alerts`                     | Alertas, mais graves primeiro. Filtros: `status` (padrão `ABERTO,RECONHECIDO`), `severity`, `regionId` |
| POST   | `/api/alerts/:id/acknowledge`     | Reconhece um alerta aberto (`by` opcional)  |
| GET    | `/api/equipment-types`            | Tipos e seus atributos                      |
| POST   | `/api/equipment-types`            | Cria tipo (com `attributesSchema`)          |
| GET    | `/api/equipments`                 | Filtros: `q`, `typeId`, `status`, `district`, `region` (código), `agency`, `urgency`, `connectivity` |
| GET    | `/api/equipments/:id`             | Ficha (eventos + transições possíveis)      |
| POST   | `/api/equipments`                 | Cadastra equipamento                        |
| PUT    | `/api/equipments/:id`             | Atualiza dados (exceto situação)            |
| POST   | `/api/equipments/:id/status`      | Altera situação (máquina de estados)        |
| POST   | `/api/equipments/:id/maintenance` | Agenda manutenção                           |
| GET    | `/api/equipments/:id/telemetry`   | Leituras mais recentes (`limit`, padrão 50) |
| POST   | `/api/telemetry`                  | Ingestão de telemetria: `{ serialNumber, metrics, receivedAt? }` ou um lote (até 500) |
| GET    | `/api/agents`                     | Filtros: `role`, `active`, `fieldStatus`, `q` |
| POST   | `/api/agents`                     | Cadastra agente (com posição no mapa)       |
| PUT    | `/api/agents/:id`                 | Atualiza agente                             |
| POST   | `/api/agents/:id/position`        | Posição do agente: `{ latitude, longitude, fieldStatus?, recordedAt? }` |
| GET    | `/api/agents/:id/positions`       | Trilha recente (`minutes`, padrão 30)       |
| GET    | `/api/cep/:cep`                   | Consulta endereço no ViaCEP                 |
| GET    | `/metrics`                        | Métricas no formato Prometheus              |
