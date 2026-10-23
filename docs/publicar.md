# Cómo publicar

Las dos piezas se publican por separado. El plugin de Claude Code no necesita ningún registro: este repositorio ya es su marketplace. La extensión de VS Code sí necesita una cuenta de publicador en el Marketplace de Visual Studio.

## Antes de cada versión

1. Sube la versión en los tres manifiestos:
   - `.claude-plugin/plugin.json`
   - `.claude-plugin/marketplace.json` (la entrada del plugin)
   - `vscode/package.json`
2. Anota los cambios en `CHANGELOG.md` y en `vscode/CHANGELOG.md`.
3. Corre todas las pruebas ([pruebas.md](pruebas.md)):

   ```
   claude plugin validate ./ && claude plugin test ./
   cd vscode && npm ci --include=dev && npm test && cd ..
   python scripts/e2e_puente.py --claude "$(which claude)"
   ```

4. Si cambió algo visual, regenera las capturas: `scripts/capturas_terminal.py` y `cd vscode && npm run screenshots`.
5. Haz push a `main`. La página del Marketplace toma las imágenes de `main` en GitHub, así que tienen que estar subidas antes de publicar la extensión.

## Plugin de Claude Code

Con el push a `main` ya está publicado. Para instalarlo, cualquiera escribe esto dentro de `claude`:

```
/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
```

Quien ya lo tenga recibe la versión nueva con `/plugin` → *Marketplaces* → *Update*, o con `claude plugin marketplace update visual-code-latigo-claude`.

## Extensión de VS Code

### Una sola vez: crear el publicador

1. Entra a <https://marketplace.visualstudio.com/manage> con una cuenta de Microsoft y crea el publicador **`ronalc90`**. Tiene que ser exactamente el `publisher` de `vscode/package.json`.
2. En Azure DevOps (<https://dev.azure.com>), crea un *Personal Access Token*:
   - **Organization:** *All accessible organizations*
   - **Scopes:** *Custom defined* → **Marketplace → Manage**
3. Guarda el token en un gestor de contraseñas. Nunca va en el repositorio.

### Cada versión

```
cd vscode
npm ci --include=dev
npm run package                      # genera latigo-claude-<versión>.vsix con los enlaces a GitHub
npx vsce login ronalc90              # pide el token la primera vez
npx vsce publish --packagePath latigo-claude-0.2.0.vsix
```

`npm run package` le pasa a `vsce` las rutas de GitHub (`--baseContentUrl` y `--baseImagesUrl`) para que las imágenes del README se vean en la página del Marketplace. Publicar ese mismo `.vsix` con `--packagePath` conserva esas rutas.

### Open VSX (Cursor, VSCodium y otros)

Esos editores usan Open VSX en lugar del Marketplace de Microsoft. Con una cuenta en <https://open-vsx.org> y su token:

```
npx ovsx create-namespace ronalc90 -p <token>   # solo la primera vez
npx ovsx publish latigo-claude-0.2.0.vsix -p <token>
```

### Versión en GitHub

Adjunta el `.vsix` a una versión de GitHub para quien prefiera instalarlo a mano:

```
gh release create v0.2.0 vscode/latigo-claude-0.2.0.vsix --title "v0.2.0" --notes-file CHANGELOG.md
```

## Lista de revisión del Marketplace

| Requisito | Dónde | Estado |
|---|---|---|
| `publisher`, `name`, `displayName`, `description`, `version` | `vscode/package.json` | listo |
| `engines.vscode` | `^1.85.0` | listo |
| Icono PNG de 128×128 (no SVG) | `vscode/images/icon.png` | listo |
| Licencia | `vscode/LICENSE` (MIT) | listo |
| Repositorio, página y reporte de errores | `repository`, `homepage`, `bugs` | listo |
| Categorías válidas | `AI`, `Visualization`, `Other` | listo |
| README con imágenes por HTTPS | lo resuelve `npm run package` | listo |
| Sin imágenes SVG en el README | solo PNG | listo |
| `.vsix` sin archivos de más | `npx vsce ls`: 11 archivos | listo |
| Publicador creado y token | Marketplace y Azure DevOps | **pendiente: lo hace Ronald** |
