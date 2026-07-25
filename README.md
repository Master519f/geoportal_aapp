# Supabase Explorer - Schema `epmapaq`

## Resumen

Se creó una página HTML (`supabase-explorer.html`) que conecta a Supabase vía el cliente JavaScript, lista todas las tablas del schema `epmapaq` y permite consultar sus datos con filtros.

---

## 1. Conexión

```js
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  db: { schema: 'epmapaq' }
});
```

- **URL**: `https://befaumtpegfkwrephusu.supabase.co`
- **Anon Key**: provista por el usuario
- **Schema default**: `epmapaq` (se configura en el cliente para que `supabase.from('tabla')` apunte automáticamente a `epmapaq.tabla`)

---

## 2. Listar tablas del schema

Se implementaron 4 estrategias en orden de prioridad:

1. **RPC `get_schema_tables` desde `epmapaq`**
2. **RPC `get_schema_tables` desde `public`**
3. **Consulta directa a `information_schema.tables` desde `public`** (funciona sin configuración extra)
4. Muestra instrucciones SQL para crear la función RPC

Las tablas se muestran en una barra lateral con navegación por clic.

---

## 3. Consultar datos de una tabla

Al seleccionar una tabla se ejecuta:

```js
supabase.from(tabla).select('*', { count: 'exact' }).limit(500)
```

Se renderiza una tabla HTML con todas las columnas y filas (máximo 500).

### Filtros

La barra de herramientas permite filtrar con el formato `columna.operador.valor`:

| Operador | Significado | Ejemplo |
|----------|------------|---------|
| `eq` | igual a | `id.eq.5` |
| `neq` | distinto de | `estado.neq.inactivo` |
| `gt` | mayor que | `edad.gt.18` |
| `gte` | mayor o igual | `cantidad.gte.100` |
| `lt` | menor que | `precio.lt.50` |
| `lte` | menor o igual | `stock.lte.10` |
| `like` | patrón SQL | `nombre.like.A%` |
| `ilike` | patrón case-insensitive | `nombre.ilike.a%` |
| `is` | nulo | `deleted_at.is.null` |
| `in` | múltiples valores | `id.in.1,2,3` |

Se pueden combinar separando con coma: `estado.eq.activo,edad.gte.18`

---

## 4. Problemas encontrados y soluciones

### 4.1. `window.supabase.createClient is not a function`

**Causa**: El bundle UMD de supabase-js v2 no exponía correctamente `createClient` como función global.

**Solución**: Se reemplazó `<script src=".../umd/supabase.js">` por ES Modules con importmap:

```html
<script type="importmap">
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.49.1"
  }
}
</script>
<script type="module">
import { createClient } from '@supabase/supabase-js';
</script>
```

### 4.2. `permission denied for schema epmapaq` (HTTP 401)

**Causa**: El rol `anon` no tenía permisos sobre el schema `epmapaq`.

**Solución en Supabase Dashboard**:

1. **Settings → API → Extra search paths**: agregar `public, epmapaq`
2. Ejecutar en SQL Editor:
   ```sql
   GRANT USAGE ON SCHEMA epmapaq TO anon, authenticated;
   GRANT ALL ON ALL TABLES IN SCHEMA epmapaq TO anon, authenticated;
   ALTER DEFAULT PRIVILEGES IN SCHEMA epmapaq
     GRANT ALL ON TABLES TO anon, authenticated;
   ```

### 4.3. Consultas devuelven 0 filas (RLS)

**Causa**: Row Level Security (RLS) está habilitado por defecto en las tablas de Supabase. Sin un policy que permita SELECT al rol `anon`, la consulta devuelve 0 filas.

**Solución**: Ejecutar en SQL Editor:

```sql
-- Opción A: Desactivar RLS (simple, datos públicos)
ALTER TABLE epmapaq.catastro DISABLE ROW LEVEL SECURITY;
ALTER TABLE epmapaq.parroquias DISABLE ROW LEVEL SECURITY;
ALTER TABLE epmapaq.redes DISABLE ROW LEVEL SECURITY;

-- Opción B: Crear policy SELECT (RLS activo, pero permite lectura)
CREATE POLICY "anon_select" ON epmapaq.catastro FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON epmapaq.parroquias FOR SELECT TO anon USING (true);
CREATE POLICY "anon_select" ON epmapaq.redes FOR SELECT TO anon USING (true);
```

---

## 5. Archivo generado

| Archivo | Ruta |
|---------|------|
| `supabase-explorer.html` | `C:\Users\DETPC\AppData\Local\Temp\opencode\supabase-explorer.html` |

Para usarlo, abrir directamente en Edge (o cualquier navegador moderno). No requiere servidor web.

El warning `Unsafe attempt to load URL file://...` en la consola es normal al abrir páginas HTML desde el sistema de archivos local y no afecta el funcionamiento.
