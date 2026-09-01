# settleworth.online — reglas de trabajo

Web nicho **call-to-click**: calculadoras de indemnización para el mercado de
EE. UU., a monetizar con AdSense. La conversión es la página vista con anuncio.
La microconversión que la multiplica es el clic a otra calculadora del sitio.
El KPI del modelo es **páginas por sesión**, no visitas.

Vertical **YMYL legal**: alguien puede usar la cifra que devuelve la herramienta
para decidir si acepta la oferta de su aseguradora. La exactitud no es una
cuestión de calidad, es la razón por la que el sitio puede existir.

Lee esto entero antes de tocar nada.

---

## 1. Antes de decir que algo está hecho, ejecútalo

```bash
python3 -m http.server 8899 &      # desde la raíz del repo
node scripts/verificar.mjs
```

24 comprobaciones. Sale con código 1 si algo falla. **No se despliega en rojo.**

Necesita `playwright` disponible y Chromium. No sustituyas el script por leer el
diff: en este proyecto se dio por terminada una pasada de 8 especialistas y al
medir aparecieron cosas que nadie había visto.

### Y desconfía también del script

La primera vez que se ejecutó dio 4 fallos. **Tres eran errores del propio
script**, no del sitio:

- Buscaba «Florida» cerca de «pure comparative» y saltaba con una frase que
  decía justo lo contrario (que Florida barra al 51 % desde 2023).
- Juzgaba el formulario vacío leyendo `document.body.innerText`, que incluye los
  ejemplos con cifras del cuerpo de la página, en vez del panel `.result`.
- Rellenaba los formularios con 2.000 semanas y daba por roto el modo que, con
  razón, rechazaba un valor absurdo.

Una comprobación que falla no demuestra que el sitio esté mal. **Reproduce el
caso a mano antes de "arreglar" nada**: casi se corrigió contenido que era
correcto.

---

## 2. Invariantes que no se negocian

| Invariante | Cómo se comprueba |
|---|---|
| El mapa de culpa cita su estatuto por estado | comprobación 7 |
| Un formulario vacío nunca produce una cifra | comprobación 7 |
| La calculadora está pre-renderizada en el HTML | comprobación 4 |
| Canonical, og:url, JSON-LD y sitemap, todos en **www** | comprobación 1 |
| El H1 va dentro de `<main id="main">` | comprobación 12 |
| 0 `aggregateRating` | comprobación 13 |
| 0 peticiones a terceros | comprobación 10 |

### Por qué el www no es un capricho
El ápice responde **308** hacia www. Cuando las 19 canonicals, el sitemap y los
`og:url` apuntaban al ápice, **el sitemap entregaba cero URLs válidas** y cada
página se auto-canonicalizaba a una URL que redirige.

### Por qué la calculadora va en el HTML
Googlebot indexa la primera ola **sin JS**. Con la herramienta inyectada entera
por JavaScript, un rastreador veía prosa *sobre* una calculadora, no una
calculadora. El paso 1 —barra de progreso, etiquetas y el selector de las 51
jurisdicciones— se sirve estático; `calculator.js` lo sustituye con
`mount.innerHTML` al cargar. Es mejora progresiva: si tocas el montaje,
regenera el estático y vuelve a pasar la comprobación 4.

---

## 3. Exactitud del motor: lo que se corrigió y no puede volver

Estos casos estaban **en producción** dando cifras equivocadas:

| Caso | Qué hacía | Qué hace ahora |
|---|---|---|
| South Dakota | Prometía el 60 % a quien la ley deja sin nada | No da cifra y cita SDCL § 20-9-2 |
| West Virginia | Barrera al 50 % | Barrera al 51 %, W. Va. Code § 55-7-13c(c) |
| Michigan | Bloqueaba todo por encima del 50 % | Solo los daños no económicos, MCL 600.2959 |
| D.C. | Barraba a peatones y ciclistas | Excepción de D.C. Code § 50-2204.52 |
| Wrongful termination | Devolvía $15.000–$25.000 con el formulario **vacío** | «No estimate yet» |
| `num()` | `1250.75` → `125.075`; `-5000` → `+5.000`; `1e9` → `19` | Validado y saneado |

**Ninguna cifra sin fuente.** Se eliminaron el tope nacional inventado de
$1.200/semana, las bandas ±, la tabla de daño emocional y punitivos = back pay
× 0,5. Lo que queda sin respaldo publicado va **declarado en pantalla** como
convención de negociación, no como tabla oficial.

**Un campo que se pregunta tiene que influir en el resultado.** Se eliminó el
selector de estado de workers' comp por decorativo. Si añades un campo,
compruébalo.

---

## 4. Contenido y copy

- **El copy no puede prometer lo que el motor no calcula.** En wrongful
  termination se muestra el techo de 42 U.S.C. § 1981a; distress y punitivos
  «se argumentan, no se calculan». La comprobación 14 exige que ese matiz esté.
- **Nada de consejo legal.** El sitio informa y hace aritmética. Un FAQ que
  decía «¿Debo aceptar la primera oferta? — Rara vez» se reescribió para
  informar sin aconsejar. Mismo criterio en todo lo demás.
- **Florida ya no es *pure comparative*** desde la reforma de 2023. Si tocas
  los ejemplos de estados, revísalo en las 7 páginas que los citan.
- Metas de 130-155 y titles de 50-70, sincronizados con `og:` (comprobación 12).
  `Not legal advice` **no** va en la metadescription: quema ~18 caracteres de
  snippet. El descargo vive en la página, que es donde protege.
- La CTA principal de cada página apunta a **otra URL**. Si apunta a sí misma no
  produce la microconversión del modelo.

---

## 5. Lo que decide la aprobación de AdSense

Del manual de nichos: las políticas y el «quiénes somos» se dan por hechos, **no
es por ahí por donde rechazan**. Pesan el idioma y el país, la temática, y la
antigüedad de la cuenta.

En el nicho hermano (dekkalkulator, noruego) el rechazo fue «contenido de poco
valor», y la causa eran 11 URLs que respondían a una multiplicación y que 9 de
ellas servían como texto estático sin herramienta. **Aquí ese riesgo se midió:**

| Criterio | settleworth.online |
|---|---|
| Similitud entre páginas (Jaccard, 5-gramas) | **2,4 %** de media, 0 pares por encima del 25 % |
| Palabras por página de dinero | 934 – 1.860 |
| URLs con intención trivial | **0** |
| Páginas legales | las 4, de 418 a 624 palabras |
| Herramienta visible sin JS | sí, desde la corrección de la comprobación 4 |

No hay contenido de poco valor. Lo que queda fuera del código es el §6.

---

## 6. Lo que no depende del código — y bloquea la monetización

Ninguna de estas tres la puede hacer un agente: necesitan tus identificadores.

1. **Etiqueta de verificación de AdSense.** No existe en el sitio. Sin ella no
   se puede ni solicitar la revisión. Va en el `<head>` de las 19 páginas:
   `<meta name="google-adsense-account" content="ca-pub-TU_ID">`
2. **Analítica.** No hay `gtag` ni `dataLayer` configurado. `calculator.js` ya
   emite 9 eventos `sw_` (`sw_tool_start`, `sw_calc_complete`, `sw_calc_blocked`…),
   pero sin un ID `G-` no los recoge nadie, y sin eso **no existe el KPI del
   modelo**, que es páginas por sesión.
3. **Consentimiento.** No hay banner de cookies ni Consent Mode v2. El sitio
   apunta a EE. UU., donde no es un bloqueante de aprobación, pero Google lo
   exige para servir a usuarios del EEE. Decisión tuya según a quién quieras
   servir.

**Y lo que no se puede fabricar:** el sitio se publicó el 05-06-2026 y Search
Console sigue sin explotarse. AdSense también pesa tráfico y antigüedad. Esto
deja el sitio en condiciones; no garantiza la aprobación.

---

## 7. Regla de aislamiento

**Un tipo de cambio por despliegue.** Si agrupas, ejecuta el script después de
cada uno, no al final. En la pasada de los 8 especialistas los tres únicos
defectos reales aparecieron **en las costuras entre especialistas**, no dentro
del trabajo de ninguno: un ejemplo trabajado que contradecía a su propia
calculadora en 12.000 $, un skip link que saltaba 1.570 px por debajo de la
herramienta, y el `<main>` mal envuelto en 18 de 19 páginas.

---

## 8. Estructura

```
*.html                    19 URLs (sitemap.xml)
assets/calculator.js      motor de las 4 ramas — el mapa de culpa vive aquí
assets/style.css          diseño; CSS muerto al 4,3 %
assets/fonts/             Space Grotesk + Plus Jakarta Sans, subseteadas
scripts/verificar.mjs     las 24 comprobaciones
vercel.json               cabeceras de caché y seguridad
```

---

## 9. Decisiones abiertas, del dueño

| Decisión | Estado |
|---|---|
| **La marca está ocupada**: `settleworth.co` es un sitio activo e indexado en el mismo vertical y `settleworth.com` está registrado | Sin decidir. Rebrandear cuesta menos ahora, con 19 URLs y cero backlinks |
| Monetizar con AdSense (~146 $/mes base) frente a lead-gen (~59×) | Decidido: AdSense, por posicionamiento |
| Linkbuilding | No, por ahora. Webs-nicho sin autoridad ya rankean en esta SERP |
| `alee07tf@gmail.com` como contacto en el JSON-LD de `Organization` | Pendiente de sustituir por un correo de dominio |
