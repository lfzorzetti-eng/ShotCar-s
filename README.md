# CarDex

Pokédex de carros: fotografe um carro, a IA identifica marca e modelo, e ele entra no álbum da marca com uma raridade.
Arquitetura completa no doc "Car'sShot's — Arquitetura".

## Rodar pela primeira vez

1. `npm install`
2. `cp .env.example .env` e preencha:
   - `MONGODB_URI`: connection string do MongoDB Atlas (Database > Connect > Drivers). Libere seu IP em Network Access.
   - `JWT_SECRET`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `OLLAMA_API_KEY`: crie em https://ollama.com/settings/keys
3. Monte o catálogo (uma vez):
   ```sh
   npm run catalogo:importar     # FIPE + vPIC + Wikidata → Mongo, gera revisao-catalogo.md
   npm run catalogo:curadoria    # grava os espaços do álbum e as raridades de curadoria.json
   ```
4. `npm run dev` e abra http://localhost:5173

No computador, `localhost` já libera a câmera. No celular, a câmera exige HTTPS:
`cloudflared tunnel --url http://localhost:5173` (ou `ngrok http 5173`) e abra a URL https no celular.

## Comandos

| Comando | O que faz |
| --- | --- |
| `npm run dev` | API (porta 3000) + front Vite (5173) com recarga |
| `npm run build && npm start` | Front compilado servido pela própria API na porta 3000 |
| `npm run catalogo:importar` | Importa as fontes; `-- --sem-wikidata` etc. pula uma fonte |
| `npm run catalogo:curadoria` | Aplica `curadoria.json`; `-- --criar-faltantes` cria à mão slugs que nenhuma fonte trouxe |
| `npm run ia:modelos` | Lista os modelos com visão no Ollama configurado |
| `npm run ia:testar -- <pasta>` | Teste das 50 fotos: arquivos nomeados pelo slug esperado (`porsche-911.jpg`, `porsche-911-2.jpg`) |

## IA

`RECONHECEDOR=ollama` usa o Ollama Cloud (padrão `gemma4:31b`). `RECONHECEDOR=mock` sorteia um modelo,
para testar o fluxo sem IA. Para trocar de provedor, crie um arquivo em `src/reconhecimento/` com
`identify({ foto, catalogo })` e registre em `index.mjs`.

Com mais de 300 modelos no catálogo, o reconhecimento é feito em duas etapas: primeiro a marca, depois só os modelos dela.

## O que mudou em relação ao doc

- As rotas ficam sob `/api` (`/api/capturas`, `/api/album/:marca`…).
- `capturas` ganhou `status` (`confirmada` ou `pendente`) e `palpites`: captura com confiança < 0.6 fica pendente até o
  usuário escolher um palpite em `POST /api/capturas/:id/confirmar` (`{"slug": null}` descarta). Só as confirmadas contam no álbum.
- A resposta da IA ganhou `palpites` (até 3 slugs), usados na confirmação.
# ShotCar-s
