# Bibliotecas de terceiros (servidas pelo próprio app)

Ficavam em CDN (`cdn.jsdelivr.net` / `cdnjs`). Rede corporativa e proxy costumam bloquear esses
hosts e aí o app abria com a tela toda em branco, sem mensagem. Agora saem de `/static/vendor/`.

Os arquivos são os mesmos que as CDNs serviam: o `integrity` (SHA-384) no `index.html` é o mesmo de
antes e o navegador recusa qualquer arquivo diferente.

| Arquivo | Pacote npm | Caminho no pacote |
|---|---|---|
| `marked.min.js` | `marked@9.1.6` | `marked.min.js` |
| `purify.min.js` | `dompurify@3.4.16` | `dist/purify.min.js` |
| `highlight.min.js` | `@highlightjs/cdn-assets@11.9.0` | `highlight.min.js` |
| `highlight-github-dark.min.css` | `@highlightjs/cdn-assets@11.9.0` | `styles/github-dark.min.css` |
| `mermaid.min.js` | `mermaid@10.9.8` | `dist/mermaid.min.js` |
| `html2canvas.min.js` | `html2canvas@1.4.1` | `dist/html2canvas.min.js` |

Para trocar de versão: `npm pack <pacote>@<versão>`, copie o arquivo e recalcule o hash:

```bash
openssl dgst -sha384 -binary arquivo.min.js | openssl base64 -A
```
