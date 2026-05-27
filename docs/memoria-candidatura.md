---
title: "valencIA"
subtitle: "Chatbot público y servidor MCP instalable para los datos abiertos del Ayuntamiento de València"
author: "Michel Marques"
date: "28 de mayo de 2026"
lang: es-ES
---

# Ficha de candidatura

| Campo | Información |
|---|---|
| Convocatoria | Premios para proyectos de datos abiertos y periodismo de datos del Ayuntamiento de València, edición 2026 |
| Categoría | Proyectos de Datos Abiertos |
| Título del proyecto | valencIA |
| Subtítulo | Chatbot público y servidor MCP instalable para consultar los datos abiertos del Ayuntamiento de València desde cualquier IA compatible |
| Persona solicitante | Michel Marques |
| Tipo de persona | Persona física |
| Autores | Michel Marques |
| Representante | No aplica |
| Identificación | Se consigna únicamente en el formulario oficial de la Sede Electrónica |
| Ámbito territorial | Municipio de València |
| Estado del proyecto | Implantado y accesible públicamente |
| Estado de candidatura | Presentada electrónicamente el 28 de mayo de 2026 mediante el procedimiento AD.TR.15 |
| Interfaz conversacional pública | <https://valencia-mcp.vercel.app> |
| Repositorio público | <https://github.com/iMark21/valencia-opendata> |
| Paquete npm | <https://www.npmjs.com/package/valencia-opendata> |
| Licencia del código | MIT |
| Licencia de los datos reutilizados | Creative Commons Atribución 4.0 Internacional, Ajuntament de València |

![Pantalla principal de valencIA](../web/public/screenshots/hero.png){width=92%}

# Resumen ejecutivo

**valencIA** es una herramienta abierta que permite consultar los datos abiertos del Ayuntamiento de València mediante preguntas en lenguaje natural, en castellano o valenciano, sin conocimientos técnicos previos.

La propuesta lleva al ámbito municipal una experiencia que la ciudadanía ya reconoce en asistentes conversacionales como ChatGPT: preguntar de forma natural y recibir una respuesta inmediata. La diferencia es clave: valencIA no es un chatbot genérico, sino una IA acotada a València, conectada a fuentes oficiales del Ayuntamiento y diseñada para responder con datos trazables, mapas, tablas, tarjetas visuales y enlaces de verificación.

El proyecto combina dos piezas:

- Una **interfaz conversacional pública** que cualquier persona puede usar desde el navegador, sin registro y sin instalación.
- Un **servidor Model Context Protocol (MCP)** publicado como paquete npm, instalable con `npx -y valencia-opendata`, que permite conectar cualquier IA compatible con MCP al portal municipal de datos abiertos.

El objetivo principal es reducir la distancia entre los conjuntos de datos publicados y las preguntas reales de la ciudadanía. En lugar de exigir que la persona usuaria conozca CKAN, ArcGIS, APIs, formatos GeoJSON o identificadores de capas, valencIA interpreta la pregunta, invoca la herramienta adecuada, consulta la fuente oficial en tiempo real y devuelve una respuesta verificable con atribución y enlace a la fuente.

El sistema cubre actualmente **294 datasets del portal CKAN** y diversas capas del Geoportal ArcGIS municipal. Incluye herramientas específicas para calidad del aire, ValenBisi, tráfico, EMT, información de barrios, búsqueda textual y descubrimiento de capas geográficas.

La web no es una maqueta ni una página promocional: es el producto en uso. Funciona como un ChatGPT municipal especializado en datos abiertos de València. Además, el mismo motor se distribuye como servidor MCP instalable para que cualquier cliente de IA compatible pueda reutilizar las herramientas desde Claude Desktop, Cursor, Continue.dev, VS Code u otros entornos. La persona usuaria escribe una pregunta cotidiana y el sistema responde con datos oficiales, mapas, tablas, tarjetas visuales y enlaces de verificación.

# Interfaz conversacional y ejemplos de uso

El valor diferencial de valencIA se percibe al interactuar con la web pública. La interfaz permite formular preguntas como se harían a una persona experta en datos municipales, pero conservando trazabilidad técnica y fuente oficial.

Esto cambia la relación de la ciudadanía con el portal de datos abiertos. Ya no hace falta saber qué dataset buscar, qué capa ArcGIS contiene una estación, qué recurso tiene formato GeoJSON o cómo interpretar una respuesta JSON. valencIA convierte ese proceso técnico en una conversación: pregunta, herramienta, dato oficial, explicación y fuente.

| Pregunta del usuario | Qué resuelve valencIA | Evidencia visible |
|---|---|---|
| "Quina és la qualitat de l'aire a Russafa ara?" | Localiza la estación de referencia, obtiene contaminantes y presenta una valoración comprensible. | Tabla de valores, tarjeta de calidad del aire y atribución al Geoportal. |
| "Hi ha ValenBisi prop de la Catedral?" | Geocodifica el punto, busca estaciones cercanas y compara bicis y muelles disponibles. | Mapa, listado de estaciones y tarjeta de disponibilidad. |
| "Compara la qualitat ambiental de Russafa i Campanar" | Calcula un pulso ambiental compuesto combinando capas de aire, verde urbano, ruido y vulnerabilidad. | Comparación por barrio y explicación de los factores usados. |
| "Quins datasets hi ha sobre vulnerabilitat social?" | Busca en el catálogo CKAN y devuelve conjuntos relevantes con formatos y enlaces. | Resultados filtrados, metadatos y URLs del portal. |
| "Qué buses pasan cerca de la Estación del Norte?" | Consulta paradas EMT cercanas y muestra líneas disponibles. | Paradas, líneas y enlace a información operativa. |
| "Estado del tráfico ahora mismo en el centro" | Consulta tramos y capas de tráfico municipal. | Intensidad, cámaras disponibles y fuente de cada capa. |

Estos ejemplos demuestran que el proyecto no se limita a publicar código: entrega una experiencia ciudadana completa. Una persona puede entrar, preguntar, comprobar el origen del dato y compartir la consulta sin instalar nada.

## Pruebas verificables

El jurado puede comprobar el funcionamiento del proyecto directamente:

- **Prueba ciudadana inmediata:** abrir <https://valencia-mcp.vercel.app> y formular cualquiera de las preguntas anteriores.
- **Prueba técnica reproducible:** instalar el servidor con `npx -y valencia-opendata` y conectarlo a un cliente MCP compatible.
- **Prueba de fuente:** cada respuesta muestra atribución y URLs de CKAN o Geoportal ArcGIS del Ayuntamiento de València.
- **Prueba de calidad:** el repositorio incluye 142 tests automáticos y flujo de CI público.
- **Prueba de reutilización:** el código está publicado bajo licencia MIT y el paquete npm permite integrarlo en otros asistentes o herramientas.
- **Prueba de comunicación:** las consultas pueden compartirse mediante URL y exportarse como HTML autocontenido.

![Consulta de ValenBisi con mapa y datos estructurados](../web/public/screenshots/query-map.png){width=84%}

![Consulta de calidad del aire con tarjeta visual](../web/public/screenshots/card-air.png){width=84%}

# Objetivos

Los objetivos del proyecto son:

1. **Democratizar el acceso a los datos abiertos de València.** Permitir que cualquier persona consulte información municipal sin tener que entender estructuras técnicas, APIs o formatos de datos.
2. **Dar mayor visibilidad al portal municipal de datos abiertos.** Cada respuesta enlaza a la fuente oficial y muestra la atribución correspondiente.
3. **Promover una reutilización trazable y verificable.** Las respuestas se construyen a partir de llamadas a CKAN y al Geoportal ArcGIS, no a partir de datos inventados o copias opacas.
4. **Facilitar el trabajo de ciudadanía, periodistas, asociaciones, personal investigador y perfiles técnicos.** El proyecto sirve tanto para preguntas cotidianas como para exploración de datasets.
5. **Demostrar el potencial de los estándares abiertos aplicados a la inteligencia artificial.** El uso de MCP evita depender de una plataforma cerrada y facilita que otros clientes reutilicen la misma infraestructura.
6. **Crear una base replicable para otras administraciones.** La arquitectura puede adaptarse a otros portales CKAN o ArcGIS con un coste reducido.

# Metodología

## Fuentes utilizadas

valencIA consume exclusivamente fuentes oficiales del Ayuntamiento de València:

| Fuente | Uso dentro del proyecto |
|---|---|
| Portal CKAN `opendata.vlci.valencia.es` | Catálogo de datasets, metadatos, recursos descargables, formatos y organizaciones |
| Geoportal ArcGIS `geoportal.valencia.es` | Capas geográficas, calidad del aire, ValenBisi, tráfico, EMT y barrios |

No se realiza scraping de páginas municipales. Cuando un recurso no debe descargarse automáticamente por tamaño, formato o naturaleza de la fuente, la herramienta devuelve un enlace y metadatos para que la persona usuaria pueda acceder al dato original.

## Arquitectura técnica

El proyecto está implementado en Node.js y TypeScript. La arquitectura separa el motor de datos y la interfaz:

- **Servidor MCP:** expone herramientas reutilizables por clientes de IA.
- **Interfaz conversacional web:** aplicación Next.js que muestra chat en streaming, resultados estructurados, mapas y tarjetas visuales.
- **Tests automáticos:** 142 pruebas en modo record/replay para verificar comportamiento sin depender de la red durante la ejecución ordinaria.
- **CI pública:** GitHub Actions ejecuta compilación y tests.
- **Publicación abierta:** código en GitHub, paquete en npm e interfaz desplegada en Vercel.

## Flujo de consulta

1. La persona usuaria formula una pregunta en castellano o valenciano.
2. El sistema identifica qué herramienta necesita: aire, ValenBisi, barrios, datasets, tráfico, EMT u otra.
3. La herramienta consulta la fuente oficial en tiempo real.
4. La respuesta muestra el dato, el contexto, la atribución y la URL de origen.
5. Si procede, la interfaz añade mapa, tabla, tarjeta visual o enlace compartible.

# Conclusiones y resultados

El proyecto se encuentra implantado y disponible públicamente:

- Interfaz conversacional operativa: <https://valencia-mcp.vercel.app>
- Repositorio público: <https://github.com/iMark21/valencia-opendata>
- Paquete npm publicado: <https://www.npmjs.com/package/valencia-opendata>

Las capacidades principales son:

| Área | Resultado |
|---|---|
| Catálogo de datos | Consulta de 294 datasets con filtros por tema, formato y organización |
| Calidad del aire | Lectura de estaciones, contaminantes y valoración visual por umbrales |
| ValenBisi | Disponibilidad de bicicletas y muelles por estación y proximidad |
| Tráfico | Estado de tramos, intensidad y cámaras disponibles |
| EMT | Paradas, líneas y enlaces a información de llegada |
| Barrios | Geometría, distrito, área y pulso ambiental compuesto |
| Accesibilidad | Interfaz bilingüe y cumplimiento de criterios WCAG 2.1 AA |
| Reproducibilidad | Consultas compartibles por URL y exportación de conversaciones como HTML |

# Originalidad y grado de innovación

valencIA introduce un enfoque innovador en la reutilización de datos abiertos municipales porque combina datos urbanos oficiales, IA conversacional y un protocolo abierto de integración.

Sus elementos diferenciales son:

- **Primer servidor MCP específico para el portal de datos abiertos de València.**
- **Consulta en lenguaje natural** sobre datasets municipales, sin exigir conocimiento técnico.
- **Datos en tiempo real**, no una copia estática ni un resumen precargado.
- **Interoperabilidad mediante estándar abierto.** Cualquier cliente compatible con MCP puede conectarse al servidor.
- **Herramientas visuales dentro de la respuesta.** La web no se limita a texto: muestra mapas, tablas, tarjetas de aire y tarjetas de disponibilidad ValenBisi.
- **Trazabilidad estricta.** Cada respuesta enlaza a la fuente oficial y conserva la atribución CC BY 4.0.

La innovación no consiste solo en aplicar IA, sino en hacerlo con una arquitectura verificable: la IA no sustituye al dato oficial, sino que actúa como interfaz para acceder a él.

# Valor público e impacto social y urbano

La principal aportación pública del proyecto es convertir datos técnicamente disponibles en información realmente accesible.

## Casos de uso ciudadanos

| Perfil | Consulta posible | Valor obtenido |
|---|---|---|
| Residente | "¿Cómo está el aire ahora en Russafa?" | Información ambiental comprensible antes de salir a correr o pasear |
| Ciclista | "¿Hay ValenBisi libres cerca del Mercado Central?" | Decisión de movilidad inmediata |
| Vecina o vecino | "Dime qué datos hay de mi barrio" | Descubrimiento de información urbana local |
| Periodista | "Qué datasets hay sobre vivienda, movilidad o contaminación" | Punto de partida para piezas de investigación |
| Asociación | "Compara barrios por indicadores ambientales" | Apoyo para diagnóstico territorial |
| Desarrollador o investigadora | "Dame recursos GeoJSON sobre movilidad" | Ahorro de tiempo en exploración técnica |

## Impacto sobre la transparencia

Cada interacción aumenta la utilidad práctica del portal de datos abiertos. valencIA no oculta la fuente: la muestra. Esto refuerza la confianza en la información municipal y facilita que la ciudadanía compruebe, comparta y reutilice los datos.

## Accesibilidad

La web incorpora:

- Interfaz en castellano y valenciano.
- Navegación por teclado.
- Foco visible.
- Etiquetas ARIA semánticas.
- Contraste revisado.
- Respeto a `prefers-reduced-motion`.
- Persistencia local de historial, sin cuenta de usuario.

# Viabilidad, sostenibilidad y calidad del tratamiento de los datos

## Viabilidad técnica

El proyecto ya está en producción y requiere una infraestructura mínima:

- El servidor MCP puede ejecutarse localmente con `npx -y valencia-opendata`.
- No necesita base de datos.
- No almacena datos personales en servidor.
- Los datos se consultan directamente contra las fuentes oficiales.
- La interfaz conversacional pública está desplegada y funcionando.

## Sostenibilidad

El mantenimiento es asumible porque la arquitectura está basada en conectores pequeños y herramientas independientes. Si cambia una API upstream, los tests record/replay permiten detectar el cambio, actualizar fixtures y corregir la herramienta afectada sin reescribir el sistema completo.

## Calidad y trazabilidad de datos

El proyecto aplica las siguientes reglas:

- Usar solo CKAN y Geoportal ArcGIS como fuentes oficiales.
- Mantener atribución CC BY 4.0 en cada respuesta.
- Devolver URLs de origen para verificación independiente.
- Evitar descargas pesadas innecesarias mediante el patrón "puntero, no bytes".
- Distinguir entre dato disponible, dato no disponible y enlace de consulta externa.

# Carácter colaborativo, transparencia y apertura informativa

valencIA está publicado bajo licencia MIT. Esto permite que cualquier persona, entidad social, universidad, periodista o administración pueda usar, auditar, adaptar o mejorar el proyecto.

La apertura se materializa en:

- Repositorio público con código fuente completo.
- Paquete npm instalable.
- Documentación para uso en Claude Desktop, Cursor, Continue.dev y otros clientes MCP.
- Tests públicos.
- Licencia abierta del código.
- Reconocimiento explícito de la licencia de los datos municipales.

El proyecto también tiene potencial colaborativo porque la cobertura de datasets puede ampliarse progresivamente. Nuevas herramientas pueden añadirse para turismo, vivienda, patrimonio, equipamientos, contratación u otras áreas sin cambiar la arquitectura base.

# Relación con los criterios de valoración

| Criterio de valoración | Respuesta del proyecto |
|---|---|
| Originalidad e innovación | Uso de MCP e IA conversacional para consultar datos municipales en tiempo real |
| Valor público e impacto social y urbano | Facilita consultas cotidianas y profesionales sobre movilidad, aire, barrios y datasets |
| Viabilidad, sostenibilidad y calidad de datos | Proyecto implantado, testado, sin base de datos, con fuentes oficiales y trazabilidad |
| Carácter colaborativo y transparencia | Código abierto, paquete npm, documentación pública y atribución permanente |

# Enlaces y anexos

## Enlaces principales

- Interfaz conversacional: <https://valencia-mcp.vercel.app>
- Repositorio: <https://github.com/iMark21/valencia-opendata>
- npm: <https://www.npmjs.com/package/valencia-opendata>
- Portal CKAN del Ayuntamiento de València: <https://opendata.vlci.valencia.es>
- Geoportal ArcGIS: <https://geoportal.valencia.es>

## Herramientas implementadas

| Herramienta | Descripción |
|---|---|
| `list_datasets` | Catálogo CKAN con filtros |
| `get_dataset` | Metadatos, recursos y capas relacionadas |
| `get_dataset_resource` | URL, esquema y frescura del recurso |
| `full_text_search` | Búsqueda textual en datasets |
| `find_geo_layers` | Descubrimiento de servicios y capas ArcGIS |
| `query_geo_layer` | Consulta genérica de capas |
| `get_air_quality` | Calidad del aire en tiempo real |
| `get_valenbisi_availability` | Bicicletas y muelles libres |
| `get_traffic_state` | Estado de tráfico |
| `get_neighborhood_info` | Información de barrios |
| `get_neighborhood_pulse` | Indicador ambiental compuesto |
| `get_emt_stops` | Paradas EMT y líneas |

## Declaración de licencia y atribución

El código del proyecto se publica bajo licencia MIT.

Los datos reutilizados pertenecen al Ayuntamiento de València y se emplean conforme a la licencia Creative Commons Atribución 4.0 Internacional indicada por las fuentes municipales.

En València, a 28 de mayo de 2026.

**Michel Marques**
