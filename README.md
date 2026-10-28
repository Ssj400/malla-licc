# Mi malla · LICC

Organizador estático de la **Licenciatura en Ingeniería en Ciencia de la Computación UC**, basado exclusivamente en la malla de [BuscaRamos](https://buscaramos.osuc.dev/curriculum).

**Abrir el sitio:** <https://ssj400.github.io/malla-licc/>

## Uso

- Cada ramo es un bloque: arrástralo entre semestres o a la bandeja superior.
- Durante el arrastre puedes usar la rueda o el trackpad. Acerca el bloque al borde superior o inferior para desplazar la página automáticamente; al volver al centro se detiene. Escape cancela el arrastre.
- Suelta en el centro de otro bloque para reemplazarlo; el desplazado vuelve a la bandeja. Suelta en los bordes o entre bloques para reordenar.
- En pantallas táctiles, mantén pulsado y arrastra; acercarte al borde permite desplazar la página. También puedes tocar un bloque y elegir su ubicación y posición. El editor es accesible con teclado.
- Crea bloques personalizados o pega ramos como texto, uno por línea. Se aceptan siglas de la malla, nombres, y `SIGLA | Nombre | Créditos`.
- Los semestres tienen un máximo de **60 créditos**, no un máximo de ramos. Si un ramo no cabe, pasa al siguiente semestre con capacidad o se crea uno nuevo. En una importación, un semestre sobre el máximo se rechaza.
- Al pegar texto puedes dejar los bloques arriba o repartirlos en nuevos semestres, con el mismo tope de créditos. Se mantiene un semestre vacío al final, hasta el límite técnico de 30 semestres.
- Los créditos desconocidos se muestran **por definir** y no se suman: deben completarse para verificar la carga real. Un examen con cero créditos sí conserva su cero verificado.
- El estado se guarda **solo en este navegador y dispositivo**. Usa Exportar/Importar para respaldarlo o trasladarlo. No hay cuentas, backend ni sincronización remota.
- Restablecer recupera los ocho semestres originales más un semestre vacío de trabajo. Límites técnicos: 500 bloques totales, 300 por pegado y 30 semestres.

No es un validador de prerrequisitos ni una malla oficial. Los bloques de minor y electivos son espacios editables, no cursos elegidos automáticamente. La referencia de código de BuscaRamos no representa un año de admisión. Consulta [SOURCES.md](./SOURCES.md) para los datos y sus limitaciones.

## Desarrollo

Sin dependencias de ejecución ni compilación. Requiere un servidor HTTP para cargar los módulos JavaScript:

```sh
python3 -m http.server 4173
```

Abrir <http://localhost:4173>. Pruebas del modelo con Node.js 20 o posterior:

```sh
npm test
```

Para probar el scroll de arrastre en un navegador real (con el servidor iniciado):

```sh
npm ci
npx playwright install chromium
npm run test:scroll
```

Playwright se usa solo en desarrollo; el sitio publicado sigue sin dependencias de ejecución.

## Publicación

GitHub Pages desde la rama `main`, carpeta raíz. Las rutas son relativas y `.nojekyll` evita transformaciones. Las fuentes tipográficas se solicitan a Google Fonts; si no hay conexión, se usan las fuentes sans-serif del dispositivo. Los datos académicos se incluyen localmente y no se consultan al navegar.
