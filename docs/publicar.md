# Cómo publicar

Las dos piezas se publican por separado. El plugin de Claude Code no necesita ningún registro: este repositorio ya es su marketplace. La extensión de VS Code sí necesita una cuenta de publicador en el Marketplace de Visual Studio.

## Antes de cada versión

1. Sube la versión en los cuatro manifiestos:
   - `.claude-plugin/plugin.json`
   - `.claude-plugin/marketplace.json` (la entrada del plugin)
   - `vscode/package.json`
   - `desktop/Info.plist` (`CFBundleShortVersionString` y `CFBundleVersion`)
2. Anota los cambios en `CHANGELOG.md` y en `vscode/CHANGELOG.md`.
3. Corre todas las pruebas ([pruebas.md](pruebas.md)):

   ```
   claude plugin validate ./ && claude plugin test ./
   cd vscode && npm ci --include=dev && npm test && cd ..
   python scripts/e2e_puente.py --claude "$(which claude)"
   ```

4. Si cambió algo visual, regenera las capturas: `scripts/capturas_terminal.py`, `cd vscode && npm run screenshots`, y las fotos y el GIF de la app ([pruebas.md](pruebas.md#capturas)).
   Si cambió `desktop/Sources/Synth.swift`, regenera los sonidos sintéticos (las pruebas de la app fallan si no): `desktop/build/Látigo.app/Contents/MacOS/Latigo --render-sounds assets`.
5. Haz push a `main`. La página del Marketplace toma las imágenes de `main` en GitHub, así que tienen que estar subidas antes de publicar la extensión.

## Plugin de Claude Code

Con el push a `main` ya está publicado. Para instalarlo, cualquiera escribe esto dentro de `claude`:

```
/plugin install latigo --marketplace ronalc90/Visual-code-Latigo-Claude
```

Quien ya lo tenga recibe la versión nueva con `/plugin` → *Marketplaces* → *Update*, o con `claude plugin marketplace update visual-code-latigo-claude`.

## App de escritorio

```
desktop/build.sh --test
```

Sale `desktop/build/Latigo-macOS.zip` (universal, firma local *ad hoc*); se adjunta a la versión de GitHub. Para distribuirla sin el aviso de Gatekeeper hay que firmarla con un *Developer ID* de Apple y notarizarla (cuenta de desarrollador de Apple, de pago).

## Extensión de VS Code

### Una sola vez: crear el publicador

Entra a <https://marketplace.visualstudio.com/manage> con tu cuenta de Microsoft y crea el publicador con el ID **`ronalc90`**:

- Tiene que ser exactamente el `publisher` de `vscode/package.json`.
- El ID no se puede cambiar después.

### Cada versión: subir el `.vsix` (sin token)

1. Genera el paquete:

   ```
   cd vscode && npm ci --include=dev && npm run package
   ```

   Sale `latigo-claude-<versión>.vsix`, con los enlaces de las imágenes apuntando a GitHub. También sirve el `.vsix` adjunto a la versión de GitHub.
2. En <https://marketplace.visualstudio.com/manage>:
   - La primera vez: **New extension** → **Visual Studio Code** y sube el archivo.
   - En las versiones siguientes: **Update** sobre la extensión.
3. El Marketplace lo revisa (incluye un análisis de virus) y en unos minutos aparece en el buscador de extensiones de VS Code.

### Por consola (opcional)

`npx vsce publish` necesita un *Personal Access Token* de Azure DevOps con el alcance **Marketplace → Manage**.

**Ojo:** los tokens globales (*All accessible organizations*), que eran los que pedía `vsce`, **dejan de funcionar el 1 de diciembre de 2026**. Microsoft recomienda Microsoft Entra ID para publicar de forma automática. Mientras no haga falta automatizar, subir el `.vsix` a mano es lo más simple.

### Open VSX (Cursor, VSCodium y otros)

Esos editores usan Open VSX en lugar del Marketplace de Microsoft. Con una cuenta en <https://open-vsx.org> y su token:

```
npx ovsx create-namespace ronalc90 -p <token>   # solo la primera vez
npx ovsx publish latigo-claude-<versión>.vsix -p <token>
```

### Versión en GitHub

Adjunta el `.vsix` a una versión de GitHub para quien prefiera instalarlo a mano:

```
gh release create v<versión> vscode/latigo-claude-<versión>.vsix desktop/build/Latigo-macOS.zip --title "v<versión>" --notes-file <notas de esta versión>
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
| Publicador creado y `.vsix` subido | marketplace.visualstudio.com/manage | **pendiente: lo hace Ronald** |
