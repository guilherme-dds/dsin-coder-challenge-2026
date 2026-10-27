# F.O.G.O.

Projeto da etapa bônus do **DSIN Coder Challenge 2026**: uma central de operações urbanas para Marília/SP que cataloga os
equipamentos de segurança e trânsito, acompanha a cidade em tempo real e tenta antecipar o que ainda não aconteceu.

## Sumário

- [Como rodar](#como-rodar)
- [Arquitetura](#arquitetura)
- [Parte 1 · Inventário inteligente da cidade](#parte-1--inventário-inteligente-da-cidade)
- [Parte 2 · Central de operações da cidade](#parte-2--central-de-operações-da-cidade)
- [Parte 3 · Cidade preditiva](#parte-3--cidade-preditiva)
- [Design da interface](#design-da-interface)
- [Decisões técnicas](#decisões-técnicas)
- [Estrutura do código](#estrutura-do-código)
- [API](#api)
- [Uso de IA e autoria](#uso-de-ia-e-autoria)

---

## Como rodar

### Com Docker (recomendado)

```bash
docker compose up -d --build   # web em http://localhost:8080 e API em http://localhost:3333
```

Sobem três serviços:

- **server**: a API. Na inicialização aplica as migrations e, se o banco ainda não existe, cria os dados de exemplo.
  O SQLite fica no volume `db-data`, então os dados sobrevivem a reinícios e rebuilds.
- **web**: o frontend compilado, servido pelo nginx, que encaminha `/api` e `/metrics` para o `server`.
- **simulator**: o simulador da cidade (veja abaixo). Para desligar: `docker compose stop simulator`.

Variáveis opcionais: `WEB_PORT` (padrão `8080`), `API_PORT` (padrão `3333`), `SEED_ON_START=true` (recria os dados
de exemplo ao subir, apagando os atuais) e `BACKFILL_ON_START=false` (desliga o preenchimento de períodos parados).
Para recomeçar do zero: `docker compose down -v`.

### Sem Docker

```bash
npm run setup   # instala dependências, cria o banco e popula com dados de exemplo
npm run dev     # API em http://localhost:3333, web em http://localhost:5173 e o simulador da cidade
```

Outros comandos (dentro de `server/` ou com `-w server`): `db:reset`, `db:seed`, `db:studio`, `simulate`, `backfill`.

### Simulador da cidade

O [simulador](server/scripts/simulate.ts) faz o papel dos dispositivos IoT e das equipes em campo, usando **os mesmos
endpoints que o PROMETHEUS usaria**:

- envia telemetria de cada dispositivo e a posição das equipes a cada 10 s;
- registra **ocorrências** (acidentes, congestionamentos, vandalismo, furtos…) no ritmo realista da cidade, cerca de
  19 por dia, e as encerra após o tempo típico de atendimento;
- de tempos em tempos provoca incidentes: dispositivo que para de responder, leitura anômala (câmera sem imagem, totem
  sem papel, patinete sem bateria) e agente sem sinal. Três dispositivos ficam permanentemente mudos, para a falha
  silenciosa estar sempre visível.

Variáveis opcionais: `API_URL`, `TICK_MS` (padrão `10000`), `INCIDENT_CHANCE` (padrão `0.04`) e `OCCURRENCE_RATE`
(multiplicador do ritmo de ocorrências, padrão `1`).

### Dados de exemplo e histórico

A [seed](server/prisma/seed.ts) cria a cidade de Marília/SP: 10 tipos de equipamento, 36 equipamentos, 15 agentes em
6 regiões e um histórico para a parte preditiva: **90 dias de ocorrências**, **60 dias de resumos diários de
telemetria** e **7 dias de disponibilidade por hora**.

Esse histórico vem de um [perfil de comportamento da cidade](server/scripts/city-profile.ts) com padrões plantados:
picos nos horários de ida e volta do trabalho, vandalismo de madrugada e no fim de semana, a Zona Sul piorando mês a
mês e alguns dispositivos se degradando aos poucos. **Os modelos de previsão nunca leem esse perfil**: descobrem os
padrões a partir dos dados gravados, como fariam com dados reais. Isso permite conferir se eles acertam.

**Períodos com o sistema desligado.** Se o ambiente ficar parado (por exemplo, o Docker desligado durante a noite),
não há registros desse período, e os gráficos o marcam como "sem dados · sistema fora do ar". No Docker, ao subir, um
[preenchimento de demonstração](server/scripts/backfill.ts) completa as paradas dos últimos 7 dias como o simulador
teria feito. Ele só acrescenta registros e não duplica se rodar de novo.

---

## Arquitetura

```
 Dispositivos IoT / simulador ──┐  telemetria, posições, ocorrências
                                ▼
                       ┌──────────────────┐        ┌────────────────────┐
  Navegador ◄────────► │  API (Express)   │ ─────► │ SQLite (Prisma)    │
  React + Leaflet      │  motor de alertas│        │ inventário, eventos│
                       │  previsões       │        │ telemetria, histór.│
                       └────────┬─────────┘        └────────────────────┘
                                │ GET /metrics
                                ▼
                     Prometheus / Grafana (PROMETHEUS)
```

| Camada   | Tecnologias                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------ |
| Backend  | Node 22, Express 5, TypeScript, Prisma, SQLite, Zod                                              |
| Frontend | React 19, Vite, React Router, Leaflet + leaflet.heat, Lucide                                     |
| Infra    | Docker Compose (API, web com nginx, simulador), npm workspaces, `/metrics` no formato Prometheus |

Tarefas em segundo plano da API: o **motor de alertas** (a cada 30 s e logo após cada ação do operador), a
**fotografia de disponibilidade** (a cada 15 min) e a **consolidação da telemetria** em resumos diários (de hora em
hora, antes que a retenção de 24 h apague as leituras brutas).

---

## Parte 1 · Inventário inteligente da cidade

| O que o desafio pede                                                                                                                           | Como foi atendido                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tipos de equipamento (radar, câmera, balança, veículos de fiscalização, cancela, transporte, totem, patinete, motos, viaturas, "entre outros") | Os 10 tipos citados vêm cadastrados. Cada tipo define seus próprios campos, então **um tipo novo não exige mudar código**.                                                                                                              |
| Número de série, marca e modelo                                                                                                                | Série única por equipamento, marca e modelo obrigatórios.                                                                                                                                                                               |
| Localização: CEP, bairro, cidade/UF, rua, referência livre e coordenadas                                                                       | O CEP preenche o endereço (ViaCEP). A referência é livre ("oposto ao número 181", "KM 203", "em frente ao Mercado do Tio"). As coordenadas vêm de um **clique no mapa** ou do GPS do dispositivo. Equipamentos móveis registram a base. |
| Situação atual                                                                                                                                 | Não instalado, operacional, mau funcionamento, em manutenção, desativado, furtado e baixado, com **regras de transição**: um equipamento furtado não volta direto a operacional.                                                        |
| Necessidade de manutenção                                                                                                                      | Imediata, periódica ou agendada, com a data da próxima. Mau funcionamento gera manutenção imediata; ao voltar a operar, a próxima periódica é reprogramada sozinha.                                                                     |
| Outras características por tipo                                                                                                                | Campos dinâmicos validados pela API (ex.: câmera com visão noturna, resolução e colorida; radar com modalidade e velocidade máxima).                                                                                                    |
| Cadastro de agentes                                                                                                                            | Agentes de trânsito, guardas municipais e policiais, com matrícula, posto, turno, base e posição no mapa.                                                                                                                               |

Também há:

- **Histórico de eventos** imutável em cada equipamento: cadastro, mudanças de situação (com quem fez e por quê) e
  manutenções.
- **Órgão responsável** por equipamento: Trânsito, Guarda Municipal, Polícia Militar ou concessionária.
- **Cadastro pelo mapa**: no mapa operacional, "Cadastrar no mapa" + um clique abre o formulário com a posição
  preenchida.
- **Listas** de equipamentos e agentes com uma faixa de resumo que funciona como filtro rápido (por urgência e por
  situação em campo), busca e filtros. Na lista de agentes, um mapa mostra a posição das equipes.

---

## Parte 2 · Central de operações da cidade

| O que o desafio pede                                                                                | Como foi atendido                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ver no mapa todos os equipamentos e agentes, com ícones por tipo                                    | Mapa operacional como tela inicial: equipamentos em círculo e agentes em quadrado, com o ícone do tipo ou da função.                                                                           |
| Identificar a situação de forma simples                                                             | Cor por **urgência** ou por **situação**, à escolha do operador, com legenda. Equipamento sem comunicação ganha uma marca no canto do pino.                                                    |
| Indicadores gerais: total, operacionais, indisponíveis, % de disponibilidade e agentes em atividade | Tela Indicadores. A disponibilidade conta só quem está **operando e comunicando**. Os agentes em atividade contam a situação em campo, e não o cadastro.                                       |
| Filtros por tipo, situação, bairro, região, órgão e outros                                          | Região, bairro, órgão (vale também para agentes), situação, comunicação, urgência, tipo e busca.                                                                                               |
| Destacar manutenção imediata ou próxima                                                             | Urgência _Crítico_ (manutenção imediata ou falha), _Alerta_ (vencida) e _Atenção_ (nos próximos 7 dias), mais alertas de manutenção vencida e próxima.                                         |
| Alertas para situações críticas                                                                     | Motor de alertas com fila no mapa, ordenada por gravidade, com reconhecimento e ação recomendada.                                                                                              |
| Detalhes de equipamento ou agente direto no mapa                                                    | Ficha lateral ao clicar: situação, comunicação, último contato, órgão, próxima manutenção, características e última leitura de telemetria (recolhíveis), e ação rápida de mudança de situação. |
| Visão consolidada das regiões                                                                       | Cartões por região com disponibilidade, nível de saúde e pendências. Clicar abre o mapa já filtrado e enquadrado.                                                                              |

### Tempo real e a falha silenciosa

- Mapa, alertas, fichas e indicadores **se atualizam sozinhos**. O topo mostra "atualizado há X s", ou que a API
  caiu.
- A API **recebe telemetria e posições** (`POST /api/telemetry` e `POST /api/agents/:id/position`) e calcula a
  comunicação de cada dispositivo: online, instável, sem comunicação.
- **Falha silenciosa**: um equipamento "operacional" que parou de enviar telemetria há mais de 10 min sobe para a
  urgência _Alerta_, abre um alerta e passa a contar como indisponível, **mesmo que ninguém tenha registrado a falha**.
  É a resposta mais direta à pergunta "PROMETHEUS conseguirá perceber?".

### Motor de alertas

A cada 30 s (e logo após cada ação do operador), as regras são reavaliadas sobre o estado da cidade. O alerta abre
sozinho, muda de gravidade se a situação piorar e se resolve sozinho quando a condição some. O operador só o
reconhece.

| Alerta                                                                            | Gravidade      | Ação recomendada                                                     |
| --------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Equipamento furtado                                                               | Crítica        | Acionar a Guarda Municipal, registrar o boletim, avaliar a reposição |
| Região com disponibilidade abaixo de 60% / 80%                                    | Crítica / Alta | Priorizar o reparo dos equipamentos da região                        |
| Falha reportada                                                                   | Alta           | Despachar a equipe de manutenção                                     |
| Sem comunicação há mais de 10 min                                                 | Alta           | Verificar energia e conexão no local                                 |
| Manutenção vencida / próxima                                                      | Média / Baixa  | Agendar ou confirmar a manutenção                                    |
| Leitura fora do limite (câmera sem imagem, totem sem papel, patinete sem bateria) | Média          | Vistoria do dispositivo                                              |
| Agente sem sinal                                                                  | Média          | Contatar o agente por rádio ou telefone                              |

### Indicadores

- **Disponibilidade da rede**, com as marcas dos limites de atenção (80%) e crítico (60%), mais indisponíveis,
  alertas abertos e agentes em atividade.
- **Regiões** com nível de saúde: _crítica_ (alerta crítico ou disponibilidade abaixo de 60%), _atenção_ (alerta
  grave ou abaixo de 80%) ou _normal_.
- **Disponibilidade nas últimas 24 h** (cidade ou região), registrada a cada 15 min.
- **Fila de atendimento**, com o motivo de cada equipamento estar nela, e a **composição** da rede em abas
  (situação, comunicação, tipo, equipes em campo).

---

## Parte 3 · Cidade preditiva

As previsões ficam na tela **Previsões** e também viram **alertas preventivos**. Todas seguem três princípios:

1. **Aprendem com os dados gravados**, nunca com o perfil que gerou os dados de exemplo.
2. **Explicam-se**: toda resposta da API traz um bloco `about` (o que prevê, dados considerados, como calcula e como
   ajuda), e a tela mostra isso em "Como esta previsão funciona".
3. **Viram ação**: cada previsão vem com os fatores que pesaram e uma recomendação concreta.

As técnicas são estatística explicável (médias ponderadas, Poisson, regressão linear, desvios robustos), escolhidas
para que o gestor entenda e confie no número, e não para parecerem sofisticadas.

### O que foi previsto e como ajuda na decisão

| Previsão                      | Pergunta que responde                                               | Como ajuda                                   |
| ----------------------------- | ------------------------------------------------------------------- | -------------------------------------------- |
| Risco por região e horário    | Onde e quando as ocorrências tendem a acontecer nas próximas horas? | Antecipar patrulhas e fiscalização           |
| Semana típica (mapa de calor) | Quais dias e horários são historicamente mais críticos?             | Planejar escalas e operações recorrentes     |
| Reforço de agentes            | Quantos agentes cada região vai precisar em cada turno?             | Remanejar ou convocar antes do pico          |
| Falha provável                | Qual equipamento deve falhar nos próximos 7 dias, e por quê?        | Antecipar a manutenção                       |
| Anomalias                     | Qual equipamento está se comportando fora do próprio padrão?        | Achar sensor com defeito ou tráfego desviado |
| Tendências                    | Quais regiões estão piorando, e qual equipamento tem uso crescendo? | Agir antes de cruzar os limites              |

### Risco por região e horário

- **Dados**: ocorrências das últimas 12 semanas (região, dia da semana, hora e gravidade), ocorrências das últimas
  3 h e o estado das câmeras de cada região.
- **Cálculo**: média de cada região × dia da semana × hora, com mais peso para as semanas recentes (meia-vida de 3
  semanas, para acompanhar tendências) e suavizada pelo padrão geral da região quando o horário tem poucos dados, para
  que uma ocorrência rara não vire um pico falso. Dois ajustes ao vivo:
  - **momento atual**: mais ou menos ocorrências que o esperado nas últimas 3 h, com efeito que some em poucas horas;
  - **câmeras fora do ar**: vandalismo e furto tendem a subir.
- **Índice 0–100**: em quantos % dos horários da cidade a carga esperada, ponderada pela gravidade, é menor. 85 ou
  mais é risco alto, de 60 a 84 moderado.
- **Fatores explicados**, por exemplo: "Tendência de alta: +50% de ocorrências por semana nas últimas 4 semanas".

### Reforço de agentes

Agentes ocupados esperados no pico de cada turno = ocorrências × agentes empenhados × tempo de atendimento. O efetivo
necessário é o **menor número de agentes com o qual a chance de todos estarem ocupados quando surge uma nova
ocorrência fica abaixo de 20%** (distribuição de Poisson). Comparado com os agentes escalados no turno, indica
_reforçar_, _adequado_ ou _folga_, e sugere remanejar de quem tem folga para quem precisa.

### Falha provável (manutenção preditiva)

- **Risco base**: a taxa de falhas do tipo de equipamento no histórico.
- **Fatores do equipamento**, que multiplicam o risco base:
  - desgaste que já passou do limite (×5) ou que deve cruzá-lo em até 7 dias (×4);
  - leitura fora do padrão (×2);
  - falhas anteriores, manutenção vencida, instabilidade recente e bairro com mais falhas que a média.
- **Probabilidade** = 1 − e^(−taxa × dias × fatores).
- **Desgaste**: a tendência (regressão linear) da medição rumo ao limite de funcionamento. Para a câmera é a média de
  quadros por segundo; para a bateria é a **carga máxima** que ela atinge (a capacidade), e não a média, que só
  reflete o uso.
- O **motivo principal** e a **ação** seguem a prioridade operacional (desgaste, depois sensor anômalo, depois
  preventiva vencida…), e não o maior multiplicador.

### Anomalias

Cada um dos últimos 3 dias completos é comparado com a mediana de 7 a 35 dias atrás, depois de **descontar o peso do
dia da semana** aprendido no próprio equipamento. É um ajuste sazonal: o domingo de um radar vale cerca de 0,45 de um
dia útil, então um domingo tranquilo não parece queda. A distância é medida em desvios robustos (MAD). Para virar
anomalia, o dia precisa ter **3 ou mais desvios e variação de 30% ou mais, em pelo menos 2 dias**: estatisticamente
improvável e grande o bastante para importar.

### Tendências

- **Disponibilidade**: regressão da disponibilidade por hora da última semana, da cidade e de cada região, projetada
  7 dias à frente, com o aviso de quando deve cruzar 80% ou 60%.
- **Ocorrências**: regressão do volume semanal das últimas 12 semanas, com a previsão para a próxima semana.
- **Uso dos equipamentos**: regressão das médias semanais de uso (radar, cancela, totem, balança); médias semanais
  evitam que o fim de semana pareça queda.
- Só é apontada a tendência que dificilmente é acaso (estatística t ≥ 2) e de tamanho relevante.

### Alertas preventivos

As previsões entram no mesmo motor de alertas, marcadas como **preventivas** e nunca críticas, porque o problema
ainda não aconteceu. São recalculadas a cada 5 min.

| Alerta                | Quando abre                                                                                     |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| Risco previsto        | Região com índice ≥ 90 nas próximas 3 h **e** efetivo insuficiente (ou momento acima do normal) |
| Falha provável        | Chance ≥ 25% em 7 dias, ou desgaste cruzando o limite                                           |
| Comportamento anômalo | Medição fora do padrão, quando ainda não explicada por uma falha provável                       |
| Tendência de queda    | Disponibilidade caindo e abaixo de 80%, ou cruzando 80% em até 7 dias                           |
| Ocorrências em alta   | Região com ocorrências subindo 5% ou mais por semana                                            |

### Tela de Previsões e mapa

- **Resumo**: regiões com risco alto em 24 h, agentes a reforçar no turno, falhas esperadas na semana, equipamentos
  fora do padrão e tendências de piora.
- **Abas**, para não mostrar tudo de uma vez:
  - **Risco e reforço**: faixa de 24 h por região, semana típica e reforço por turno;
  - **Manutenção preditiva**: chance de falha com o motivo e a ação, e os equipamentos fora do padrão;
  - **Tendências**.
- No mapa operacional, a camada **"Risco previsto agora"** desenha cada região na cor do seu nível de risco.
- O `/metrics` exporta o risco por região, a probabilidade de falha por equipamento e as falhas esperadas na semana.

### Os modelos acertam?

Os padrões plantados no histórico de exemplo servem de verificação. Sem nunca ler o perfil que os gerou, os modelos
encontram:

- a **Zona Sul piorando** (+50% de ocorrências por semana e disponibilidade caindo);
- o **pico de vandalismo da Zona Oeste às 21 h** e os horários de pico de trânsito;
- a **câmera perdendo quadros** dia a dia, prevista para cruzar o limite em cerca de 7 dias;
- o **radar contando 62% menos veículos** que o normal;
- a **bateria do patinete** abaixo da capacidade útil;
- o **totem com uso crescendo** cerca de 30% em 8 semanas.

---

## Design da interface

A interface foi redesenhada a partir de referências de sistemas de monitoramento reais, para fugir dos excessos
decorativos comuns em interfaces geradas por IA (gradientes, brilho, vidro fosco, animação em tudo):

- **ISA-101** (padrão de telas de salas de controle): o que está normal fica **neutro e cinza**, e cor saturada só
  aparece para o que é anormal. **Piscar** fica reservado ao alerta crítico ainda não reconhecido.
- **IBM Carbon**: o estado nunca depende só da cor. Cada indicador tem **forma + cor + rótulo**
  (◆ crítica, ▲ alta, ■ média, ● baixa).
- **Grafana**: painéis sólidos encaixados, números grandes e neutros, limites coloridos.
- **Menos informação ao mesmo tempo**: filtros e legenda recolhidos atrás de botões, detalhes em seções recolhíveis,
  abas no lugar de blocos empilhados e tabelas só com as colunas que mudam a decisão.
- Telas que ocupam toda a largura, tema escuro, tipografia IBM Plex com números de largura fixa, e layout que se
  adapta ao celular.

---

## Decisões técnicas

- **Tipos dinâmicos**: cada tipo de equipamento define seus campos (`attributesSchema`), validados em tempo de
  execução com Zod.
- **Máquina de estados** da situação e **histórico de eventos** imutável. O histórico alimenta o calor de falhas e a
  manutenção preditiva.
- **Disponibilidade real**: só conta quem opera e comunica. Uma única função calcula os números da cidade e das
  regiões, para que dashboard, regiões, histórico e `/metrics` sempre batam entre si.
- **Horário da cidade (UTC−3)** em todos os padrões de hora e dia da semana. O container roda em UTC, e sem isso
  os padrões ficariam 3 h deslocados.
- **Carência de 2 min ao subir a API**: as regras que dependem do silêncio dos dispositivos ficam congeladas, para que
  a volta de uma parada não pareça a cidade inteira sem comunicação.
- **Telemetria em duas camadas**: as leituras brutas ficam 24 h, e resumos diários (média, mínimo, máximo) guardam o
  histórico longo para as previsões.
- **Um alerta por problema**: chave de deduplicação por regra e origem, e avaliações do motor serializadas.
- **Pronto para o PROMETHEUS**: `GET /metrics` no formato de exposição do Prometheus, com inventário, alertas,
  disponibilidade e previsões.

---

## Estrutura do código

```
server/
  prisma/                 schema, migrations e seed (Marília/SP)
  scripts/
    simulate.ts           simulador de dispositivos, equipes e ocorrências
    city-profile.ts       perfil usado só para gerar dados de exemplo
    backfill.ts           preenchimento de períodos com o sistema desligado
  src/
    domain/               regras puras: situação, urgência, comunicação, disponibilidade,
                          ocorrências, telemetria, horário da cidade, estatística
    modules/
      equipments/         inventário, situação e manutenção
      equipment-types/    tipos com atributos dinâmicos
      agents/             agentes, posição e trilha
      map/                dados do mapa operacional e calor de falhas
      dashboard/          indicadores consolidados
      regions/            visão por região e histórico de disponibilidade
      alerts/             motor de alertas e API
      telemetry/          ingestão, resumo diário e retenção
      occurrences/        ocorrências operacionais
      predictions/        risco, reforço, falhas, anomalias, tendências e alertas preventivos
      metrics/            exportador Prometheus
      cep/                proxy do ViaCEP
web/
  src/
    pages/                Mapa operacional, Indicadores, Previsões, Equipamentos, Ficha, Agentes
    components/           mapa, alertas, gráfico, faixa de resumo, indicadores de status
```

---

## API

| Método | Rota                              | Descrição                                                                                   |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/map`                        | Equipamentos, agentes (com a região de cada um), regiões e pontos de calor                  |
| GET    | `/api/dashboard`                  | Disponibilidade, agentes em atividade, alertas, comunicação e composição da rede            |
| GET    | `/api/regions`                    | Visão consolidada por região                                                                |
| GET    | `/api/regions/history`            | Histórico de disponibilidade (`regionId` opcional; `hours`, padrão 24)                      |
| GET    | `/api/alerts`                     | Alertas com a ação recomendada. Filtros: `status`, `severity`, `regionId`, `preventive`     |
| POST   | `/api/alerts/:id/acknowledge`     | Reconhece um alerta aberto                                                                  |
| GET    | `/api/equipment-types`            | Tipos e seus atributos                                                                      |
| POST   | `/api/equipment-types`            | Cria tipo (com `attributesSchema`)                                                          |
| GET    | `/api/equipments`                 | Filtros: `q`, `typeId`, `status`, `district`, `region`, `agency`, `urgency`, `connectivity` |
| GET    | `/api/equipments/:id`             | Ficha (eventos e transições possíveis)                                                      |
| POST   | `/api/equipments`                 | Cadastra equipamento                                                                        |
| PUT    | `/api/equipments/:id`             | Atualiza dados (exceto situação)                                                            |
| POST   | `/api/equipments/:id/status`      | Altera a situação (máquina de estados)                                                      |
| POST   | `/api/equipments/:id/maintenance` | Agenda manutenção                                                                           |
| GET    | `/api/equipments/:id/telemetry`   | Leituras mais recentes                                                                      |
| POST   | `/api/telemetry`                  | Ingestão de telemetria: `{ serialNumber, metrics, receivedAt? }` ou lote (até 500)          |
| GET    | `/api/agents`                     | Filtros: `role`, `active`, `fieldStatus`, `q`                                               |
| POST   | `/api/agents`                     | Cadastra agente                                                                             |
| PUT    | `/api/agents/:id`                 | Atualiza agente                                                                             |
| POST   | `/api/agents/:id/position`        | Posição da equipe: `{ latitude, longitude, fieldStatus?, recordedAt? }`                     |
| GET    | `/api/agents/:id/positions`       | Trilha recente (`minutes`, padrão 30)                                                       |
| GET    | `/api/occurrences`                | Ocorrências. Filtros: `days`, `regionId`, `kind`, `open`, `limit`                           |
| POST   | `/api/occurrences`                | Registra ocorrência                                                                         |
| POST   | `/api/occurrences/:id/resolve`    | Encerra a ocorrência                                                                        |
| GET    | `/api/predictions/risk`           | Risco por região, hora a hora (`hours`, até 72), com fatores                                |
| GET    | `/api/predictions/risk/heatmap`   | Risco por dia da semana × hora (`regionId` opcional)                                        |
| GET    | `/api/predictions/staffing`       | Agentes necessários × escalados por região e turno                                          |
| GET    | `/api/predictions/failures`       | Probabilidade de falha por equipamento (`days`, padrão 7)                                   |
| GET    | `/api/predictions/anomalies`      | Medições fora do padrão do próprio equipamento                                              |
| GET    | `/api/predictions/trends`         | Tendências de disponibilidade, ocorrências e uso                                            |
| GET    | `/api/cep/:cep`                   | Endereço pelo ViaCEP                                                                        |
| GET    | `/metrics`                        | Métricas no formato Prometheus                                                              |

---

## Uso de IA e autoria

O projeto foi desenvolvido com o apoio do **Claude Code (Anthropic)**, utilizado como ferramenta de assistência. A IA participou ativamente da implementação de partes do código, mas o desenvolvimento não foi inteiramente realizado por ela. O trabalho envolveu minha participação direta na definição dos requisitos, no planejamento das etapas, nas decisões técnicas, na revisão das alterações e na validação dos resultados.

### Meu papel como autor

Fui responsável por orientar o desenvolvimento, definir os critérios de aceitação e validar as soluções implementadas.

- **Defini o escopo e as prioridades:** interpretei os requisitos de cada etapa, identifiquei lacunas em relação ao que já havia sido desenvolvido e determinei o que precisava ser implementado ou ajustado.
- **Tomei as decisões técnicas e funcionais:** defini regras de negócio, comportamentos esperados e critérios para o funcionamento do sistema.
- **Revisei e validei as alterações:** analisei os diffs, avaliei as soluções propostas e revisei os resultados dos testes antes de incorporar as mudanças ao projeto.
- **Conduzi a evolução do projeto:** organizei as entregas em etapas, controlei as alterações por meio de commits e mantive a padronização do código, incluindo formatação e comentários.

Algumas decisões sob minha responsabilidade incluem:

- Definir que um equipamento marcado como _operacional_, mas sem comunicação, deve passar para o estado de _Alerta_.
- Determinar que os gráficos apresentassem dados também nos períodos em que o sistema estivesse desligado no ambiente de demonstração.
- Decidir quando recriar os dados do banco e quando preservar os registros existentes.

### Como a IA foi utilizada

O Claude Code foi utilizado como **ferramenta de apoio à implementação, análise e depuração**, sempre com base nas orientações e nos critérios definidos durante o desenvolvimento.

- **Implementação de código:** gerou e modificou trechos de código a partir de instruções, requisitos e planos definidos ao longo do projeto.
- **Análise de requisitos:** auxiliou na comparação entre as funcionalidades existentes e os requisitos de cada etapa, identificando possíveis lacunas.
- **Investigação e correção de problemas:** ajudou a investigar defeitos, analisar suas causas e propor soluções, como as falhas no histórico de dados, os falsos positivos na detecção de anomalias e os efeitos dos fins de semana nas comparações.
- **Testes e validação:** auxiliou na execução e análise de testes em bancos de dados temporários e no navegador. Os problemas identificados foram avaliados e corrigidos durante o processo.

### Considerações sobre a autoria

A utilização de IA não substituiu minha participação no desenvolvimento. O código foi produzido por meio de um processo colaborativo entre minha orientação e as sugestões e implementações da ferramenta. **A definição do que deveria ser construído, as decisões sobre o comportamento do sistema, a revisão das alterações e a validação das entregas fizeram parte do meu trabalho como autor.**
