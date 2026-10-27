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
Também registra **ocorrências** (acidentes, congestionamentos, vandalismo, furtos…) no ritmo realista da cidade, cerca
de 19 por dia. Variáveis opcionais: `API_URL` (padrão `http://localhost:3333`), `TICK_MS` (padrão `10000`),
`INCIDENT_CHANCE` (chance de incidente por ciclo, padrão `0.04`) e `OCCURRENCE_RATE` (multiplicador do ritmo de
ocorrências, padrão `1`).

### Histórico para as previsões

A seed gera um histórico de exemplo para a parte preditiva: **90 dias de ocorrências**, **60 dias de resumos
diários de telemetria** e **7 dias de disponibilidade por hora**. Os dados vêm de um perfil de comportamento da
cidade ([city-profile.ts](server/scripts/city-profile.ts)), com picos nos horários de ida e volta do trabalho,
vandalismo de madrugada e no fim de semana, uma região piorando mês a mês e alguns dispositivos se degradando aos
poucos. **Os modelos de previsão nunca leem esse perfil**: descobrem os padrões a partir dos dados gravados, como
fariam com dados reais. Em produção, o histórico se forma sozinho: o simulador (ou os dispositivos reais) registra
ocorrências, e a API consolida a telemetria em resumos diários de hora em hora, antes que a retenção de 24 h a apague.
Para recriar o histórico num banco Docker já existente: `SEED_ON_START=true docker compose up -d server` (apaga os
dados atuais).

**Períodos com o sistema desligado.** Se o ambiente ficar parado (ex.: Docker desligado durante a noite), não há
registros desse período, e os gráficos o mostram como "sem dados". No Docker, ao subir, o servidor roda um
**preenchimento de demonstração** ([backfill.ts](server/scripts/backfill.ts)) que completa as paradas dos últimos
7 dias como o simulador teria feito: disponibilidade de hora em hora (interpolada entre antes e depois da parada) e
ocorrências pelo perfil da cidade. Só acrescenta registros e não duplica se rodar de novo. Desligue com
`BACKFILL_ON_START=false`, ou rode à mão com `npm run backfill`.

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
- **Ao vivo**: mapa, alertas e fichas se atualizam sozinhos a cada 10 s; o topo mostra há quanto tempo foi a última
  atualização (ou que a API está fora do ar).
- **Cor por urgência ou por situação**, à escolha do operador. Por urgência: Crítico, Alerta, Atenção, Normal,
  Pendente e Inativo, com os críticos pulsando. Por situação: operacional, mau funcionamento, em manutenção,
  desativado, furtado, não instalado e baixado, cada um com sua cor.
- **Sem comunicação à vista**: equipamento sem telemetria há mais de 10 min (ou agente sem sinal) ganha uma marca
  vermelha no canto do pino e, se estiver "operacional", sobe para urgência **Alerta**: é a falha silenciosa, que
  ninguém registrou mas o dispositivo denuncia ao parar de responder. Agentes em pausa aparecem esmaecidos.
- **Painel de alertas**: fila dos alertas abertos, dos mais graves para os mais leves, com filtro por gravidade.
  Alertas novos piscam ao chegar e o botão de alertas pulsa enquanto houver alerta crítico não reconhecido. Clicar
  no alerta leva ao equipamento ou agente (ou enquadra a região); o operador pode reconhecê-lo ali mesmo.
- **Filtros** por região, bairro, órgão responsável (vale também para os agentes), situação, comunicação, tipo,
  urgência e busca textual (série, rua, referência).
- **Camadas** independentes: equipamentos, agentes e **calor de falhas**, que mostra as regiões com maior
  concentração de falhas a partir do histórico de eventos e das falhas ativas.
- **Ficha lateral** ao clicar em um ponto: situação, comunicação e último contato, órgão, características, última
  leitura de telemetria e ação rápida de mudança de situação. Para agentes, situação em campo e última posição.
- **Cadastrar no mapa**: clique no local e o formulário abre com as coordenadas preenchidas.

## Indicadores

- **Disponibilidade da rede** (operando e comunicando ÷ instalados), operacionais, indisponíveis, agentes em
  atividade e alertas abertos, com o nível de saúde da cidade.
- **Regiões da cidade**: um card por região, das que exigem atenção para as normais, com disponibilidade, equipamentos
  sem comunicação, agentes em atividade e alertas por gravidade. Clicar abre o mapa já filtrado na região.
- **Disponibilidade nas últimas 24 h**, da cidade ou de uma região, com os limites de atenção (80%) e crítico (60%).
  Períodos sem registro (API fora do ar) aparecem como buraco na linha, sem interpolar o que não se sabe.
- **Fila de atendimento** com o motivo de cada equipamento estar nela (manutenção imediata, sem comunicação há X,
  manutenção vencida), **equipes em campo** por situação e a composição da rede por situação, comunicação e tipo.

## Cidade preditiva

Toda previsão responde com um bloco `about`: o que está sendo previsto, quais dados foram considerados, como o
cálculo é feito e como usar o resultado.

### Tela de Previsões

A tela **Previsões** abre com um resumo (regiões com risco alto em 24 h, agentes a reforçar no turno, falhas
esperadas na semana, equipamentos fora do padrão e tendências de piora) e três abas, para não mostrar tudo de uma vez:

- **Risco e reforço**: cada região numa faixa de 24 horas colorida pelo nível de risco. Clicar na região mostra o
  pico, a chance de ocorrência e os fatores que pesaram. Ao lado, a **semana típica** (dia × hora, da cidade ou de
  uma região) e o **reforço por turno** (agentes necessários / escalados, com a sugestão de remanejamento).
- **Manutenção preditiva**: equipamentos ordenados pela chance de falhar em 7 dias, com o motivo principal e a ação
  recomendada, mais a lista de equipamentos fora do padrão.
- **Tendências**: regiões com disponibilidade caindo (as estáveis ficam numa linha só), ocorrências por semana das
  últimas 12 semanas e equipamentos com uso em alta ou em queda.

Cada bloco tem um **"Como esta previsão funciona"** recolhível, com o que é previsto, os dados considerados, o cálculo
e como a previsão ajuda na decisão. No **mapa operacional**, a camada **"Risco previsto agora"** desenha cada região
na cor do seu nível de risco.

### Risco por região e horário

- **O que prevê**: o risco de ocorrências em cada região, hora a hora, para as próximas horas (até 72 h), e os dias
  da semana e horários de maior risco (mapa de calor de uma semana típica).
- **Dados usados**: ocorrências das últimas 12 semanas (região, dia da semana, hora e gravidade), ocorrências das
  últimas 3 horas e o estado das câmeras de cada região.
- **Como calcula**: média de cada região × dia da semana × hora, com mais peso para as semanas recentes (meia-vida de
  3 semanas, para acompanhar tendências), suavizada pelo padrão geral da região quando o horário tem poucos dados.
  A previsão é ajustada pelo momento atual (mais ou menos ocorrências que o esperado nas últimas 3 h, com efeito que
  some em poucas horas) e por câmeras fora de operação (vandalismo e furto tendem a subir). O **índice 0–100** diz em
  quantos % dos horários da cidade a carga esperada (ponderada pela gravidade) é menor: **85+ é risco alto, 60–84
  moderado**. Cada região traz os **fatores** que pesaram, em linguagem de operação (padrão histórico, tendência de
  alta ou de queda, momento acima do normal, câmeras fora do ar).
- **Como ajuda**: antecipar patrulhas e fiscalização nos horários e regiões de maior risco, antes das ocorrências.

### Reforço de agentes

- **O que prevê**: quantos agentes cada região vai precisar em cada turno das próximas horas.
- **Como calcula**: agentes ocupados esperados no pico do turno (ocorrências × agentes empenhados × tempo de
  atendimento). O efetivo necessário é o menor número de agentes com o qual a chance de **todos estarem ocupados
  quando surge uma nova ocorrência** fica abaixo de 20% (distribuição de Poisson). Comparado com os agentes ativos
  escalados no turno pela região da base, indica **reforçar**, **adequado** ou **folga**, e sugere remanejar de quem
  tem folga para quem precisa.
- **Como ajuda**: convocar ou remanejar equipes antes do pico, em vez de reagir depois.

### Falha provável (manutenção preditiva)

- **O que prevê**: a probabilidade de cada equipamento operacional falhar nos próximos dias (padrão: 7).
- **Dados usados**: falhas dos últimos 180 dias por tipo e por bairro, falhas anteriores do equipamento, manutenção
  vencida, telemetria diária dos últimos 21 dias, alertas recentes de comunicação e leituras fora do padrão.
- **Como calcula**: risco base = taxa de falhas do tipo no histórico. Cada fator do equipamento multiplica esse risco:
  desgaste que já passou do limite (×5) ou que deve cruzá-lo em até 7 dias (×4), leitura fora do padrão (×2), falhas
  anteriores, manutenção vencida, instabilidade e bairro com mais falhas que a média. Probabilidade =
  1 − e^(−taxa × dias × fatores). O **desgaste** é a tendência (regressão linear) da medição rumo ao limite de
  funcionamento: a média de quadros da câmera ou a **carga máxima** da bateria (a capacidade, e não o uso).
- **Como ajuda**: cada equipamento vem com os fatores que pesaram e a ação mais indicada (antecipar a manutenção,
  vistoria do sensor, executar a preventiva vencida…), para a equipe de manutenção agir antes da falha.

### Anomalias

- **O que detecta**: equipamentos cujas medições fugiram do padrão do próprio equipamento, mesmo sem ter falhado
  (ex.: radar contando 68% menos veículos: sensor com defeito ou tráfego desviado).
- **Como calcula**: cada um dos últimos 3 dias completos é comparado com a mediana de 7 a 35 dias atrás, depois de
  **descontar o peso do dia da semana** aprendido no próprio equipamento (ajuste sazonal: o domingo de um radar vale
  ~0,45 de um dia útil, então um domingo tranquilo não parece queda). A distância é medida em desvios robustos (MAD).
  3 ou mais desvios **e** variação de 30% ou mais, em pelo menos 2 dias, caracterizam a anomalia: estatisticamente
  improvável e grande o bastante para importar. Cada anomalia vem com uma interpretação do que costuma significar.

### Tendências

- **Disponibilidade**: regressão da disponibilidade por hora da última semana, da cidade e de cada região, projetada
  7 dias à frente, com o aviso de quando deve cruzar 80% ou 60%.
- **Ocorrências**: regressão do volume semanal das últimas 12 semanas por região, com a previsão para a próxima semana.
- **Uso dos equipamentos**: regressão das médias semanais de uso (radar, cancela, totem, balança) das últimas 8
  semanas. Médias semanais evitam que o fim de semana pareça queda.
- Só é apontada como tendência a inclinação que dificilmente é acaso (estatística t ≥ 2) e de tamanho relevante.

### Alertas preventivos e recomendações

As previsões entram no mesmo motor de alertas da operação, marcadas como **preventivas** (nunca críticas, porque o
problema ainda não aconteceu). Abrem sozinhas, mudam de gravidade e se resolvem quando a previsão deixa de apontar
o problema. São recalculadas a cada 5 min.

| Alerta | Quando abre | Ação recomendada |
| ------ | ----------- | ---------------- |
| Risco previsto | Região com índice ≥ 90 nas próximas 3 h **e** efetivo insuficiente (ou momento acima do normal) | Remanejar ou escalar agentes para o pico (sugestão da recomendação de reforço) |
| Falha provável | Equipamento com ≥ 25% de chance de falhar em 7 dias, ou com desgaste cruzando o limite | A ação do fator principal: antecipar a manutenção, vistoria do sensor… |
| Comportamento anômalo | Medição fora do padrão do equipamento (quando não já explicada por uma falha provável) | A interpretação da anomalia |
| Tendência de queda | Região com disponibilidade caindo e abaixo de 80% (ou cruzando 80% em até 7 dias) | Priorizar os reparos da região |
| Ocorrências em alta | Região com ocorrências subindo 5% ou mais por semana | Revisar escala e rondas |

**Todo alerta**, preventivo ou não, passou a trazer uma **ação recomendada** (ex.: furto → "acionar a Guarda Municipal,
registrar o boletim e avaliar a reposição").

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
  se resolve sozinho quando a condição deixa de existir; o operador apenas o reconhece. Nos 2 primeiros minutos após
  a API subir, as regras que dependem do silêncio dos dispositivos ficam congeladas, para que a volta de uma parada
  não pareça a cidade inteira sem comunicação.
- **Disponibilidade real**: conta os equipamentos instalados que estão operando _e_ comunicando. Um equipamento
  "operacional" que parou de enviar telemetria conta como indisponível, mesmo que ninguém tenha registrado a falha.
- **Visão por região**: os bairros são agrupados em regiões, e cada região recebe um nível de saúde: _crítico_ (alerta
  crítico aberto ou disponibilidade abaixo de 60%), _atenção_ (alerta de gravidade alta ou disponibilidade abaixo de
  80%) ou _normal_. A disponibilidade da cidade e de cada região é registrada a cada 15 min para o gráfico histórico.
- **Pronto para o PROMETHEUS**: `GET /metrics` expõe o inventário, os alertas abertos, a disponibilidade por região
  e as previsões (risco atual e de pico por região, probabilidade de falha por equipamento e falhas esperadas na
  semana) no formato de exposição do Prometheus.
- **Cadastro assistido**: CEP preenche o endereço (ViaCEP); coordenadas vêm do clique no mapa ou do GPS do dispositivo.

## API

| Método | Rota                              | Descrição                                   |
| ------ | --------------------------------- | ------------------------------------------- |
| GET    | `/api/map`                        | Equipamentos, agentes (com a região de cada um), regiões e pontos de calor |
| GET    | `/api/dashboard`                  | Disponibilidade, agentes em atividade, alertas, conectividade e composição da rede |
| GET    | `/api/regions`                    | Visão consolidada por região, das que exigem atenção para as normais |
| GET    | `/api/regions/history`            | Histórico de disponibilidade (`regionId` opcional; sem ele, a cidade) por `hours` (padrão 24) |
| GET    | `/api/alerts`                     | Alertas, mais graves primeiro, com a ação recomendada. Filtros: `status` (padrão `ABERTO,RECONHECIDO`), `severity`, `regionId`, `preventive` |
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
| GET    | `/api/occurrences`                | Ocorrências. Filtros: `days` (padrão 7), `regionId`, `kind`, `open`, `limit` |
| POST   | `/api/occurrences`                | Registra ocorrência: `{ kind, severity?, district, latitude, longitude, occurredAt?, agentsDispatched?, equipmentId?, note? }` |
| POST   | `/api/occurrences/:id/resolve`    | Encerra a ocorrência                        |
| GET    | `/api/predictions/risk`           | Risco por região, hora a hora (`hours`, padrão 24, máx. 72), com fatores |
| GET    | `/api/predictions/risk/heatmap`   | Risco esperado por dia da semana × hora (`regionId` opcional) |
| GET    | `/api/predictions/staffing`       | Agentes necessários × escalados por região e turno, com sugestões (`hours`) |
| GET    | `/api/predictions/failures`       | Probabilidade de falha por equipamento, com fatores e ação (`days`, padrão 7; `limit`) |
| GET    | `/api/predictions/anomalies`      | Medições fora do padrão do próprio equipamento nos últimos dias |
| GET    | `/api/predictions/trends`         | Tendências de disponibilidade, ocorrências e uso dos equipamentos |
| GET    | `/api/agents/:id/positions`       | Trilha recente (`minutes`, padrão 30)       |
| GET    | `/api/cep/:cep`                   | Consulta endereço no ViaCEP                 |
| GET    | `/metrics`                        | Métricas no formato Prometheus              |
