// =====================================================
// data.js - Diccionarios completos para STOP Online
// =====================================================

// =====================================================
// COLORES
// =====================================================
const COLORES = [
    'AMARILLO', 'AZUL', 'AMBAR', 'AÑIL', 'AZABACHE', 'AGUAMARINA', 
    'ALBARICOQUE', 'ANTRACITA', 'ARENA', 'ACERO', 'ALMAGRE',
    'BLANCO', 'BEIGE', 'BURDEOS', 'BERMELLON', 'BRONCE', 'BERLINA', 'BISTRE',
    'CIAN', 'CEREZA', 'CARMESI', 'CELESTE', 'CAQUI', 'CORAL', 'CASTAÑO',
    'CREMA', 'COBRE', 'COBALTO',
    'DORADO', 'DAMASCO', 'DURAZNO', 'DENIM', 'DELFIN',
    'ESMERALDA', 'ESCARLATA', 'EBANO', 'ESCARCHA', 'EUCALIPTO',
    'FUCSIA', 'FRAMBUESA', 'FLAVO', 'FUEGO', 'FELDESPATO',
    'GRIS', 'GRANATE', 'GUANABANA', 'GIRASOL', 'GUALDA', 'GLAUCO',
    'HUESO', 'HUMO', 'HIGADO', 'HERRUMBRE', 'HORTENSIA',
    'INDIGO', 'ISABELINO', 'INCANDESCENTE', 'ICTINEO',
    'JASPE', 'JADE', 'JACINTO', 'JAZMIN',
    'KAKI', 'KERMES', 'KIWANO', 'KIWI',
    'LILA', 'LADRILLO', 'LAVANDA', 'LIMA', 'LIMON', 'LINO',
    'MARRON', 'MORADO', 'MAGENTA', 'MALVA', 'MELOCOTON', 'MOSTAZA',
    'MENTA', 'MELON',
    'NARANJA', 'NEGRO', 'NACAR', 'NECTARINA', 'NIVEO',
    'ÑANDU', 'ÑAME',
    'OLIVA', 'OCRE', 'ORO', 'OPALO', 'ORQUIDEA', 'OXIDO',
    'PURPURA', 'PLATA', 'PLOMO', 'PARDO', 'PISTACHO', 'PETROLEO', 'PIEL',
    'QUETZAL', 'QUERCITRON', 'QUENEPA',
    'ROJO', 'ROSA', 'RUBI', 'REGALIZ', 'ROSA VIEJO',
    'SALMON', 'SEPIA', 'SIENA', 'SOL', 'SMARAGDINO',
    'TURQUESA', 'TERRACOTA', 'TORONJA', 'TRIGO', 'TOPACIO',
    'UVA', 'ULTRAMAR', 'URANIO',
    'VERDE', 'VIOLETA', 'VINO', 'VAINILLA', 'VERMUT',
    'WENGUE', 'WASABI', 'WISTERIA',
    'XANTICO', 'XANADU',
    'YEMA', 'YUTE', 'YESO',
    'ZAFIRO', 'ZANAHORIA', 'ZINC', 'ZARZAMORA'
];

// =====================================================
// FRUTAS
// =====================================================
const FRUTAS = [
    'AGUACATE', 'ALBARICOQUE', 'ARANDANO', 'ANANA', 'ACEROLA', 'ACAI', 'ARAZA',
    'ANONA', 'ATEMOYA', 'AQUE', 'ALQUEQUENJE', 'AGUAJE', 'ACEITUNA', 'ALMENDRA',
    'BANANA', 'BREVA', 'BOROJO', 'BABAÇO', 'BADANA', 'BACURI', 'BAYA DE GOJI', 'BELLOTA',
    'CEREZA', 'CIRUELA', 'COCO', 'CHIRIMOYA', 'CARAMBOLA', 'CAIMITO', 'CAPULIN',
    'CASTAÑA', 'CALABAZA', 'CUCURBITA', 'CIDRA', 'CHICOZAPOTE', 'CHONTADURO', 'CLEMENTINA',
    'DATIL', 'DURAZNO', 'DURIAN', 'DAMASCO', 'DIKA',
    'ENDRINA', 'ESCARAMUJO', 'ETROG', 'ELDERBERRY', 'EMBLIC',
    'FRESA', 'FRAMBUESA', 'FRUTA DE LA PASION', 'FRUTA DEL DRAGON', 'FRAMBUESA NEGRA', 'FEIJOA',
    'GRANADA', 'GUAYABA', 'GROSELLA', 'GUANABANA', 'GRANADILLA', 'GUANANDI', 'GUAMA', 'GARCINIA',
    'HIGO', 'HIGO CHUMBO', 'HUANARPO', 'HELECHO ARBORESCENTE',
    'ICACO', 'ILAMA', 'IBO', 'IMBE', 'INGA',
    'JOCOTE', 'JABUTICABA', 'JOBO', 'JACA', 'JALAPEÑO', 'JINICULI', 'JUJUBE',
    'KIWI', 'KIWANO', 'KUMQUAT', 'KAKI', 'KINO', 'KARANDA',
    'LIMON', 'LIMA', 'LITCHI', 'LUCUMA', 'LONGAN', 'LULO', 'LIMON DULCE', 'LOGANBERRY',
    'MANZANA', 'MANDARINA', 'MANGO', 'MARACUYA', 'MELON', 'MELOCOTON', 'MORA',
    'MEMBRILLO', 'MAMEY', 'MAMON', 'MARAÑON', 'MANGOSTAN', 'MANO DE BUDA',
    'NARANJA', 'NECTARINA', 'NISPERO', 'NONI', 'NANCE', 'NARANJILLA', 'NUEZ',
    'NASHI', 'NOPAL',
    'ÑANGAPIRE', 'ÑAME', 'ÑUÑA',
    'OLIVA', 'OLLUCO', 'OCUMARE', 'OCOZOAL', 'OREJA DE JUDAS',
    'PAPAYA', 'PERA', 'PIÑA', 'PLATANO', 'PITAHAYA', 'POMELO', 'PICHUBERRY',
    'PLATANGO', 'PISTACHO', 'PIMIENTO',
    'QUENEPA', 'QUINCE', 'QUINA', 'QUANDONG',
    'RAMBUTAN', 'RABANO', 'RIBES', 'RASPBERRY',
    'SANDIA', 'SAUCO', 'SARAMUYO', 'SANTOL', 'SAHUARO', 'SAPOTE',
    'TOMATE', 'TORONJA', 'TAMARINDO', 'TUNA', 'TAMARILLO', 'TAJALIN',
    'UVA', 'UCHUVA', 'UVALHA', 'UVA DE PLAYA', 'UGNI',
    'VAINILLA', 'VOAVANGA', 'VICTORIA',
    'WUMPO', 'WATERMELON', 'WALNUT', 'WOLFBERRY',
    'XOCONOSTLE', 'XANTHOSOMA', 'XYLOPIA',
    'YACA', 'YUZU', 'YOYOMO', 'YAMBU',
    'ZAPOTE', 'ZARZAMORA', 'ZIZIPHUS', 'ZAMBURIÑA'
];

// =====================================================
// ANIMALES (Lista actualizada)
// =====================================================
const ANIMALES = [
    // A
    'AGUILA', 'AVESTRUZ', 'ABEJA', 'ARDILLA', 'ANACONDA', 'ANTILOPE', 'ALPACA',
    'ALCE', 'ARANA', 'ARMADILLO',
    // B
    'BALLENA', 'BUFALO', 'BUHO', 'BISONTE', 'BABUINO', 'BARRACUDA', 'BECERRO', 'BUITRE',
    // C
    'CABALLO', 'COCODRILO', 'CAMELLO', 'CANGURO', 'CHIMPANCE', 'CEBRA', 'CASTOR',
    'CISNE', 'CACATUA',
    // D
    'DELFIN', 'DROMEDARIO', 'DINGO', 'DANTA', 'DEGU', 'DIABLO DE TASMANIA', 'DONCELLA',
    // E
    'ELEFANTE', 'ESCALABAJO', 'ERIZO', 'EMEU', 'ESPONJA DE MAR', 'ESTRELLA DE MAR', 'ESCORPION',
    // F
    'FLAMENCO', 'FOCA', 'FAISAN', 'FURA', 'FANAL', 'FRAGATA',
    // G
    'GATO', 'GORILA', 'GUEPARDO', 'GAVIOTA', 'GANSO', 'GECO', 'GATO MONTES',
    // H
    'HIENA', 'HIPOPOTAMO', 'HURON', 'HALCON', 'HAMSTER', 'HUEMUL',
    // I
    'IGUANA', 'IBICE', 'IMPALA', 'INDRI', 'IBIS',
    // J
    'JIRAFA', 'JAGUAR', 'JABALI', 'JAIBA', 'JICOTEA',
    // K
    'KOALA', 'KIWI', 'KUDU', 'KAKAPO', 'KRILL',
    // L
    'LEON', 'LEOPARDO', 'LOBO', 'LORO', 'LEMUR', 'LLAMA', 'LUCIERNAGA',
    // M
    'MONO', 'MAMUT', 'MANTA RAYA', 'MARIPOSA', 'MOFFETA', 'MORSA', 'MANATI',
    // N
    'NUTRIA', 'NARVAL', 'NAUTILO', 'NECORA', 'NIALA',
    // Ñ
    'ÑANDU', 'ÑU', 'ÑACURUTU', 'ÑANDU PETISO',
    // O
    'OSO', 'ORANGUTAN', 'ORCA', 'ORNITORRINCO', 'OVEJA', 'OSTRA',
    // P
    'PERRO', 'PANDA', 'PINGUINO', 'PANTERA', 'PUMA', 'PELICANO', 'PULPO',
    // Q
    'QUETZAL', 'QUEBRANTAHUESOS', 'QUOKKA', 'QUIQUIMOCCO',
    // R
    'RATON', 'RINOCERONTE', 'RANA', 'RENO', 'RAYA', 'RUISEÑOR',
    // S
    'SAPO', 'SALAMANDRA', 'SALMON', 'SALTAMONTES', 'SURICATA', 'SERVAL',
    // T
    'TIGRE', 'TIBURON', 'TORTUGA', 'TUCAN', 'TAPIR', 'TARANTULA',
    // U
    'URRACA', 'UALABI', 'URIAL', 'UROGALLO',
    // V
    'VACA', 'VIBORA', 'VICUÑA', 'VISON', 'VENCEJO',
    // W
    'WOMBAT', 'WAPITI', 'WEIMARANER',
    // X
    'XOLOITZCUINTLE', 'XENOPUS', 'XIFOFORO',
    // Y
    'YEGUA', 'YACARE', 'YAK', 'YARARA',
    // Z
    'ZORRO', 'ZORRILLO', 'ZAMBULLIDOR', 'ZANGANO'
];

// =====================================================
// COSAS
// =====================================================
const COSAS = [
    'MESA', 'SILLA', 'VENTANA', 'PUERTA', 'TELEFONO', 'COMPUTADORA', 'LIBRO',
    'LAPIZ', 'CUADERNO', 'BOLSA', 'ZAPATO', 'CAMISA', 'PANTALON', 'RELOJ',
    'LLAVE', 'ESPADA', 'ESPEJO', 'CUCHARA', 'TENEDOR', 'PLATO', 'TASA',
    'FLORERO', 'LAMPARA', 'BOTELLA', 'MALETA', 'GAFAS', 'BOLIGRAFO', 'MOCHILA',
    'CAMA', 'ARMARIO', 'SILLON', 'CORTINA', 'ALMOHADA', 'COLCHON', 'CUADRO',
    'ESTANTE', 'ESCALERA', 'BICICLETA', 'COCHE', 'AVION', 'BARCO', 'TREN',
    'AUTOBUS', 'MOTO', 'CAMION', 'GRUA', 'EXCAVADORA', 'TRACTOR', 'TANQUE',
    'COHETE', 'SATELITE', 'TELESCOPIO', 'MICROSCOPIO', 'TERMOMETRO', 'BAROMETRO',
    'BRUJULA', 'MAPA', 'GLOBO', 'PLANETA', 'ESTRELLA', 'LUNA', 'SOL', 'NUBE',
    'LLUVIA', 'NIEVE', 'VIENTO', 'FUEGO', 'AGUA', 'TIERRA', 'AIRE', 'ROCK',
    'ARENA', 'MONTAÑA', 'RIO', 'MAR', 'LAGO', 'BOSQUE', 'JARDIN', 'PARQUE'
];

// =====================================================
// NOMBRES
// =====================================================
const NOMBRES = [
    'ANA', 'JUAN', 'MARIA', 'JOSE', 'CARLOS', 'LUIS', 'MARTA', 'PEDRO',
    'LAURA', 'JAVIER', 'PABLO', 'DIEGO', 'SOFIA', 'VALENTINA', 'CAMILA', 'DANIEL',
    'ALEJANDRO', 'MANUEL', 'ANDRES', 'FELIPE', 'RAFAEL', 'GABRIEL', 'MIGUEL', 'ANGEL',
    'DAVID', 'CRISTIAN', 'FERNANDA', 'PAULA', 'CAROLINA', 'MONICA', 'CLAUDIA', 'LORENA',
    'ROSA', 'TERESA', 'SARA', 'LUCIA', 'MARINA', 'EVA', 'INES', 'IRENE', 'NATALIA',
    'VICTOR', 'ALBERTO', 'ANTONIO', 'FRANCISCO', 'JESUS', 'SERGIO', 'RAFAEL', 'JORGE',
    'RICARDO', 'ROBERTO', 'FERNANDO', 'GERARDO', 'ARTURO', 'ENRIQUE', 'JULIO', 'AUGUSTO',
    'ADRIAN', 'BRUNO', 'CESAR', 'DAMIAN', 'ELENA', 'FABIAN', 'GLORIA', 'HELENA',
    'IGNACIO', 'JULIAN', 'KARLA', 'LEONARDO', 'MARTIN', 'NICOLAS', 'OLIVER', 'PATRICIA'
];

// =====================================================
// APELLIDOS
// =====================================================
const APELLIDOS = [
    'GONZALEZ', 'RODRIGUEZ', 'LOPEZ', 'MARTINEZ', 'GARCIA', 'PEREZ', 'SANCHEZ',
    'RAMIREZ', 'TORRES', 'FLORES', 'RIVERA', 'MORALES', 'ORTIZ', 'CRUZ', 'REYES',
    'GUTIERREZ', 'MARTIN', 'ROMERO', 'VARGAS', 'MOLINA', 'SILVA', 'HERNANDEZ',
    'ALVAREZ', 'FERNANDEZ', 'JIMENEZ', 'DOMINGUEZ', 'HERRERA', 'MENDOZA', 'CASTILLO',
    'GOMEZ', 'DIAZ', 'GALVEZ', 'MORENO', 'MUNOZ', 'NAVARRO', 'ORTEGA', 'PARDO',
    'QUINTANA', 'RIVAS', 'RUBIO', 'SALAS', 'SOLIS', 'SUAREZ', 'TAPIA', 'VALDEZ'
];

// =====================================================
// PAÍSES Y CIUDADES
// =====================================================
const LUGARES = [
    'CHILE', 'PERU', 'ARGENTINA', 'MEXICO', 'COLOMBIA', 'VENEZUELA', 'ECUADOR',
    'BRASIL', 'ESPAÑA', 'FRANCIA', 'ALEMANIA', 'ITALIA', 'INGLATERRA', 'JAPON',
    'CHINA', 'CANADA', 'SANTIAGO', 'BUENOS AIRES', 'LIMA', 'BOGOTA', 'CARACAS',
    'MADRID', 'PARIS', 'BERLIN', 'ROMA', 'LONDRES', 'TOKIO', 'PEKIN', 'NUEVA YORK',
    'MIAMI', 'LOS ANGELES', 'SIDNEY', 'CIUDAD DE MEXICO', 'LA PAZ', 'QUITO',
    'MONTEVIDEO', 'ASUNCION', 'LISBOA', 'BARCELONA', 'VALENCIA', 'SEVILLA',
    'MILAN', 'NAPOLES', 'VENECIA', 'FLORENCIA', 'AMSTERDAM', 'BRUSELAS',
    'VIENA', 'PRAGA', 'BUDAPEST', 'ATENAS', 'ESTAMBUL', 'MOSCU', 'DUBAI',
    'SINGAPUR', 'HONG KONG', 'SEUL', 'BANGKOK', 'MANILA', 'CIUDAD DE PANAMA'
];

// =====================================================
// PALABRAS PROHIBIDAS (Trampas)
// =====================================================
const BLACKLIST = [
    'TUTO', 'TUTOS', 'TUTA', 'TUTAS', 'TUTI', 'TUTIS',
    'LOLO', 'LALA', 'PEPE', 'MOMO', 'NONO', 'KIKO',
    'RARA', 'SASA', 'TATA', 'YAYA', 'ZAZA', 'PIPI', 'PAPA',
    'MAMA', 'TIO', 'TIA', 'PRIMO', 'PRIMA', 'HERMANO', 'HERMANA',
    'BEBE', 'NENE', 'NENA', 'PAPI', 'MAMI', 'PICHU', 'CHICHI',
    'MIMI', 'TOTO', 'KOKO', 'DIDI', 'FIFI', 'NINI', 'NONA'
];

// =====================================================
// Exportar módulos (para Node.js)
// =====================================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        COLORES,
        FRUTAS,
        ANIMALES,
        COSAS,
        NOMBRES,
        APELLIDOS,
        LUGARES,
        BLACKLIST
    };
}