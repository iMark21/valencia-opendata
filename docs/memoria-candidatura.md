# Memoria de candidatura

**Convocatoria:** Premios de Proyectos de Datos Abiertos y Periodismo de Datos — València IV edición 2026
**Categoría:** Proyectos de Datos Abiertos
**Proyecto:** valencIA — Asistente de IA para los datos abiertos del Ayuntamiento de València
**Repositorio:** https://github.com/iMark21/valencia-mcp
**Demo web:** https://valencia-mcp.vercel.app
**Paquete npm:** https://www.npmjs.com/package/valencia-opendata
**Licencia:** MIT · Datos: CC BY 4.0 Ajuntament de València

---

## 1. Descripción del proyecto

**valencIA** es un servidor de inteligencia artificial que conecta cualquier asistente de IA —Claude, Cursor, Continue.dev, VS Code— al portal de datos abiertos del Ayuntamiento de València, permitiendo que cualquier ciudadano consulte esos datos en lenguaje natural, sin conocimientos técnicos y sin necesidad de instalar nada.

El proyecto implementa el estándar abierto **Model Context Protocol (MCP)**, desarrollado para que los modelos de lenguaje puedan acceder a fuentes de datos externas de forma estructurada y trazable. valencIA expone **12 herramientas** que cubren las principales temáticas del portal municipal: calidad del aire, bicicletas ValenBisi, tráfico, transporte EMT, información de barrios y descubrimiento del catálogo completo de **294 datasets**.

La propuesta se complementa con una **web demo** accesible desde cualquier navegador, que demuestra las capacidades del sistema sin requerir ninguna configuración por parte del usuario.

---

## 2. Originalidad e innovación

### La barrera que resuelve

El portal de datos abiertos del Ayuntamiento de València es una de las iniciativas de transparencia más completas de España. Sin embargo, acceder a un dato concreto —por ejemplo, la calidad del aire en Russafa en este momento— requiere hoy conocer la existencia del portal, encontrar el dataset correcto entre 294 opciones, entender su estructura, hacer una llamada a la API y interpretar la respuesta.

Esta cadena de pasos excluye al ciudadano medio. Los datos están publicados, son libres, son actuales, pero son inaccesibles en la práctica.

### La solución

valencIA traslada esa cadena de pasos al modelo de IA. El ciudadano formula su pregunta en español o en valenciano; el sistema invoca la herramienta adecuada contra el portal oficial, obtiene el dato en tiempo real y devuelve una respuesta con contexto, unidades y atribución de fuente.

```
Usuario: "¿Cuántos ValenBisi libres hay cerca de la Catedral?"

valencIA: [invoca get_valenbisi_availability con radio 500 m]
          "Hay 3 estaciones ValenBisi a menos de 500 m de la Catedral:
           · Plaça de la Reina (5 bicis / 12 muelles)
           · Carrer de la Pau (2 bicis / 8 muelles)
           · Plaça de l'Ajuntament (8 bicis / 15 muelles)
           Fuente: Ajuntament de València · CC BY 4.0"
```

### Lo que lo hace diferente

- **Primer servidor MCP** para el portal municipal de València.
- **Protocolo abierto**: cualquier cliente compatible (no solo un producto comercial) puede conectarse. El ciudadano no queda atado a ninguna plataforma.
- **Live, no snapshot**: cada consulta resuelve contra el portal en tiempo real. Los datos son los del momento, no una copia desactualizada.
- **Sin API keys, sin registro**: el portal municipal no requiere autenticación. valencIA tampoco. Cualquiera puede usarlo instalando un paquete npm.

---

## 3. Valor público e impacto social y urbano

### Democratización del acceso

Los datos abiertos solo cumplen su promesa democrática cuando son realmente accesibles. valencIA elimina la brecha entre el técnico que sabe leer una API y el ciudadano que solo quiere saber si el aire de su barrio está limpio antes de salir a correr.

Casos de uso concretos con impacto ciudadano:

| Perfil | Consulta | Dato obtenido |
|--------|----------|---------------|
| Residente | "¿Está el aire de Benimaclet dentro de los límites de la OMS?" | NO₂, PM10, PM2.5 live + comparativa límite OMS |
| Ciclista | "¿Hay bicis ValenBisi libres cerca del Mercado Central?" | Disponibilidad por estación en tiempo real |
| Periodista | "¿Qué barrio tiene peor calidad ambiental compuesta?" | Ranking de barrios por pulso ambiental (aire + verde + ruido + vulnerabilidad) |
| Investigador | "¿Qué datasets hay sobre vivienda pública y cuáles tienen formato GeoJSON?" | Catálogo filtrado con metadata y URLs de descarga |
| Vecino | "Compara la renta per cápita de Russafa y Campanar" | Datos socioeconómicos del CKAN |

### Impacto sobre el portal municipal

Cada respuesta de valencIA incluye la URL exacta del dataset o capa que la originó. El sistema actúa como un **amplificador de visibilidad** del portal: el ciudadano descubre recursos que de otra forma nunca habría encontrado.

### Accesibilidad lingüística

La web demo ofrece interfaz en **español y valenciano**. Las sugerencias de consulta, los textos de la interfaz y los mensajes del sistema están completamente localizados en ambas lenguas.

### Accesibilidad técnica

La interfaz cumple **WCAG 2.1 nivel AA**: foco visible para navegación con teclado, etiquetas ARIA semánticas, contraste de texto corregido, soporte de lectores de pantalla, sincronización del atributo `lang` del documento con el idioma seleccionado y respeto a `prefers-reduced-motion` para usuarios con sensibilidad vestibular.

---

## 4. Viabilidad y sostenibilidad

### Técnica

- **Sin dependencias de pago**: ni el portal municipal ni el modelo de IA base requieren API keys para el funcionamiento del servidor MCP. La web demo usa OpenRouter como capa de abstracción.
- **Coste operativo mínimo**: el servidor MCP funciona en local en el equipo del usuario (instalación npm) o puede desplegarse en cualquier servidor Node.js. No hay base de datos ni infraestructura compleja.
- **Tests automáticos**: 142 tests en modo record/replay garantizan que el sistema sigue funcionando aunque cambien las APIs upstream. El pipeline de CI (GitHub Actions) ejecuta build y tests en cada commit.
- **Node.js ≥ 20**: plataforma estable con soporte a largo plazo.

### Mantenimiento

- Código abierto bajo licencia MIT: cualquier desarrollador puede auditar, mejorar y contribuir.
- El diseño "pointer, not bytes" hace que el servidor sea resiliente a cambios en el tamaño o estructura de los datasets: devuelve URLs con metadata en lugar de descargar datos pesados.
- Los fixtures de tests versionados permiten detectar cambios en las APIs del portal y regrabar de forma controlada.

### Escalabilidad

El protocolo MCP permite añadir nuevas herramientas sin modificar el cliente. Cuando el portal incorpore nuevos datasets relevantes, se puede añadir cobertura con un cambio mínimo en el servidor, sin tocar la interfaz de usuario ni ningún cliente existente.

---

## 5. Carácter colaborativo

### Protocolo abierto

valencIA no es un producto de un proveedor concreto. El Model Context Protocol es un estándar abierto que cualquier desarrollador puede implementar y cualquier cliente compatible puede consumir. Esto significa que el trabajo realizado beneficia a todo el ecosistema, no solo a los usuarios de una herramienta concreta.

### Código abierto

El repositorio completo está publicado en GitHub bajo licencia MIT. Cualquier ciudadano, asociación, periodista o administración pública puede:

- Usar valencIA sin restricciones
- Auditar el código y verificar que solo se accede al portal oficial
- Proponer mejoras o añadir cobertura de nuevos datasets
- Hacer un fork y adaptarlo a otro portal de datos abiertos

### Potencial de réplica

La arquitectura de valencIA es agnóstica al portal subyacente. Con adaptaciones menores podría conectarse a otros portales CKAN de otras ciudades o comunidades autónomas. El modelo puede replicarse en cualquier administración que publique datos en CKAN o ArcGIS.

### Atribución y trazabilidad

Cada respuesta del sistema incluye la atribución CC BY 4.0 y la URL de la fuente, lo que facilita la verificación independiente y cumple con los términos de la licencia del portal.

---

## 6. Aspectos técnicos destacados

### Las 12 herramientas

| Herramienta | Fuente |
|-------------|--------|
| `list_datasets` — catálogo con filtros | CKAN |
| `get_dataset` — metadata + recursos | CKAN |
| `get_dataset_resource` — URL + esquema + frescura | CKAN |
| `full_text_search` — búsqueda full-text en 294 datasets | CKAN |
| `find_geo_layers` — descubrimiento de capas ArcGIS | Geoportal |
| `query_geo_layer` — query sobre cualquier capa | Geoportal |
| `get_air_quality` — NO₂/PM10/PM2.5/O₃ en tiempo real | Geoportal capa 156 |
| `get_valenbisi_availability` — bicis y muelles libres | Geoportal capa 228 |
| `get_traffic_state` — tramos, intensidad, cámaras | Geoportal OPENDATA/Trafico |
| `get_neighborhood_info` — geometría, distrito, área | Geoportal capa 224 |
| `get_neighborhood_pulse` — score ambiental compuesto | Multicapa |
| `get_emt_stops` — paradas EMT con líneas | Geoportal capa 226 |

### Garantías de fuente

El sistema implementa una política estricta: **solo se consumen CKAN y el Geoportal ArcGIS**, ambos con licencia CC BY 4.0 declarada. No se scrapea ninguna web municipal aunque la información sea pública. Para datos a los que no se puede acceder via API oficial, la herramienta devuelve un `pointer_url` y el usuario decide si accede directamente.

### Web demo

La interfaz web es una aplicación Next.js con diseño inspirado en la Senyera (azul, amarillo, rojo). Incluye:

- Chat en streaming con visualización del progreso de las herramientas
- Mapa Leaflet inline con puntos de interés (estaciones ValenBisi, EMT, calidad de aire)
- Cards visuales para calidad del aire (índice EAQI por contaminante) y ValenBisi (gauge de disponibilidad)
- Panel lateral con los 294 datasets organizados por categoría
- Interfaz en español y valenciano
- Diseño responsive (móvil y escritorio)
- Accesibilidad WCAG 2.1 AA (foco visible, ARIA semántico, contraste corregido, `prefers-reduced-motion`)
- Compartición de consultas por URL `?q=…` para reproducibilidad por terceros
- Persistencia local del historial (sin servidor: el ciudadano controla sus datos)
- Exportación de la conversación como HTML autocontenido con atribución CC BY 4.0

---

## 7. Relación con los objetivos del concurso

| Objetivo de la convocatoria | Respuesta del proyecto |
|----------------------------|------------------------|
| Promover los beneficios de la transparencia | Cada respuesta cita la fuente exacta y la licencia CC BY 4.0 |
| Fomentar la reutilización de la información | 12 herramientas que cubren las principales temáticas del portal |
| Dar a conocer el portal de datos abiertos municipal | El panel de 294 datasets y cada respuesta dirigen al portal |
| Fomentar herramientas innovadoras | Primer servidor MCP para el portal municipal de València |
| Conocer la ciudad a partir de los datos | Barrios, movilidad, medio ambiente, infraestructura en lenguaje natural |
| Reproducibilidad y verificación | Cualquier consulta es compartible por URL; el código y los datos son auditables |

---

## 8. Atribución y licencia

**Código:** MIT License © 2026 Michel Marques — libre uso, modificación y distribución.

**Datos:** Ajuntament de València · Licencia Creative Commons Atribución 4.0 Internacional (CC BY 4.0)
- Portal CKAN: opendata.vlci.valencia.es
- Geoportal ArcGIS: geoportal.valencia.es
