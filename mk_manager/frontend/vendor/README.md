# Bibliotecas de terceiros (servidas pelo próprio app)

Ficavam em CDN (`cdn.jsdelivr.net` / `cdnjs`). Rede corporativa e proxy costumam bloquear esses
hosts e aí o app abria com a tela toda em branco, sem mensagem. Agora saem de `/static/vendor/`.

Os arquivos são os mesmos que as CDNs serviam (SHA-384 conferido na troca). O `index.html` não usa
`integrity` para eles: o arquivo vem do próprio app, e o git no Windows (`core.autocrlf`) converte
LF→CRLF ao fazer checkout, o que mudava o hash e fazia o navegador recusar as bibliotecas. O
`.gitattributes` marca a pasta como binária para o git não mexer nos bytes.

| Arquivo | Pacote npm | Caminho no pacote |
|---|---|---|
| `marked.min.js` | `marked@9.1.6` | `marked.min.js` |
| `purify.min.js` | `dompurify@3.4.16` | `dist/purify.min.js` |
| `highlight.min.js` | `@highlightjs/cdn-assets@11.9.0` | `highlight.min.js` |
| `highlight-github-dark.min.css` | `@highlightjs/cdn-assets@11.9.0` | `styles/github-dark.min.css` |
| `mermaid.min.js` | `mermaid@10.9.8` | `dist/mermaid.min.js` |
| `html2canvas.min.js` | `html2canvas@1.4.1` | `dist/html2canvas.min.js` |

Para trocar de versão: `npm pack <pacote>@<versão>`, copie o arquivo e confira o hash com o da CDN:

```bash
openssl dgst -sha384 -binary arquivo.min.js | openssl base64 -A
```
