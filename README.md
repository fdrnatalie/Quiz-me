# Quiz me

Um quiz pessoal ("o quanto você me conhece?") para jogar em casa, com a TV como palco.

A dona do quiz monta o **gabarito** com perguntas sobre ela mesma (há 12 prontas e dá para
adicionar extras), inscreve até **10 convidados** e conduz o jogo. Cada convidado fala a resposta
em voz alta; a apresentadora a registra por **voz** ("Mariana, Japão") ou por toque, e a **TV** mostra
na hora o que cada um respondeu. Respostas parecidas com o gabarito contam como certas. No fim, a TV
mostra o placar e o vencedor.

## Como rodar

Precisa do Node 18 ou mais novo. Não há dependências para instalar.

```bash
npm start            # http://localhost:3000
```

| Endereço | Quem usa | Para quê |
|----------|----------|----------|
| `/`      | apresentadora (computador) | cadastro, gabarito, condução do jogo, registro das respostas |
| `/tv`    | TV | abertura, pergunta com tempo, revelação, vencedor |
| `/play`  | convidados (opcional) | responder pelo próprio celular |

Dica: ligue o computador à TV por HDMI e abra `/tv` em uma janela na TV, ou abra `/tv` direto no
navegador da TV. Para os celulares, use o endereço da rede local que o servidor imprime ao iniciar
(o QR code na TV já aponta para ele). A porta pode ser trocada com `PORT=8080 npm start`.

## Como o jogo funciona

1. **Cadastro:** nome da dona do quiz, convidados (o campo "Fala como" ajuda a reconhecer apelidos
   por voz), gabarito, tempo por pergunta e se respostas parecidas contam.
2. **Jogo:** a TV mostra a pergunta com cronômetro. Você registra as respostas; a TV as mostra
   conforme chegam, **sem revelar o gabarito**. "Encerrar rodada e revelar" mostra a resposta
   da dona do quiz e quem acertou. "Corrigir" muda o resultado de qualquer resposta.
3. **Pontuação:** 100 por acerto (200 nas perguntas "vale 2x") + bônus de velocidade de 30/20/10
   para os três primeiros a responder certo.
4. **Fim:** placar final, vencedor e prêmios (mais rápido, maior sequência).

### Registro por voz

Usa o reconhecimento de voz do navegador (`pt-BR`), então funciona melhor no **Chrome/Edge**, e o
navegador pede permissão para o microfone. Fale "nome, resposta"; depois de 3,5 s o registro é
confirmado sozinho (ou toque em Confirmar/Cancelar). Falar a próxima pessoa confirma a anterior.
Sem voz, digite na linha do convidado ou toque nas respostas já dadas, que viram atalhos.

## Publicar na internet (iPad, TV e celulares com HTTPS)

O GitHub Pages não serve (só hospeda sites estáticos), mas o Render roda este app direto do
repositório e atualiza a cada commit. O HTTPS é necessário para o microfone funcionar no iPad/Safari.

1. Crie uma conta em https://render.com e conecte o GitHub.
2. **New > Blueprint**, escolha este repositório (o `render.yaml` já tem tudo).
3. Quando o Render pedir `QUIZ_PIN`, digite a senha da apresentadora.
4. Abra o endereço `https://….onrender.com` no iPad e entre com a senha. Na TV abra `/tv`; os convidados,
   `/play`.

Cuidados no plano gratuito: o serviço "dorme" após cerca de 15 minutos sem acessos (a primeira visita
demora ~1 minuto para acordar) e o disco é temporário, então o gabarito se perde se o serviço reiniciar.
Monte o quiz perto da hora de jogar e deixe a TV aberta. Disco persistente exige plano pago.

## Dados e segurança

- O estado fica em `data/quiz.json` (ignorado pelo git) e sobrevive a reinícios.
- A TV e o celular **nunca recebem o gabarito** antes da revelação; isso é decidido no servidor.
- Sem `QUIZ_PIN`, não há login: quem acessar `/` na sua rede controla o jogo. Com `QUIZ_PIN=senha npm start`, `/` e os controles pedem a senha (TV e celular continuam abertos, e nunca recebem o gabarito).

## Testes

```bash
npm test
```

Cobrem comparação de respostas, interpretação das falas, pontuação, limites e que o gabarito não vaza.

## Estrutura

```
server.js          servidor HTTP + tempo real (Server-Sent Events), sem dependências
lib/game.js        regras: estado, ações, pontuação, o que cada tela pode ver
public/js/shared.js  comparação de respostas e interpretação de voz (servidor e navegador)
public/            telas: index.html (apresentadora), tv.html, play.html
public/vendor/     qrcode-generator (MIT)
```
