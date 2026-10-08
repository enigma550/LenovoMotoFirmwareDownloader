export const ptBR: Record<string, string> = {
  // Cabeçalho e Geral
  'APP.TITLE': 'Software Fix',
  'APP.FULL_TITLE': 'Lenovo Moto Software Fix',
  'APP.SUBTITLE': 'Ferramenta de Resgate e Recuperação de Firmware',
  'STATUS.BRIDGE_CONNECTED': 'Conectado',
  'STATUS.BRIDGE_DISCONNECTED': 'Desconectado',
  'STATUS.AUTHENTICATED': 'Autenticado na Lenovo',
  'STATUS.NOT_AUTHENTICATED': 'Não Autenticado',
  'THEME.LIGHT': '☀ Modo Claro',
  'THEME.DARK': '☾ Modo Escuro',
  'LANG.PT': 'Português (BR)',
  'LANG.EN': 'English',

  // Autenticação
  'AUTH.TITLE': 'AUTENTICAÇÃO LENOVO',
  'AUTH.DESC': 'Faça login na sua conta Lenovo para pesquisar e baixar firmwares oficiais.',
  'AUTH.TOKEN_DETECTED': 'Token salvo detectado. Login com 1 clique disponível.',
  'AUTH.OPEN_SIGN_IN': 'Abra o login da Lenovo e conclua a autenticação.',
  'AUTH.CHECKING_TOKENS': 'Verificando tokens salvos...',
  'AUTH.QUICK_LOGIN': 'Login Rápido',
  'AUTH.LOGIN_BROWSER': 'Abrir Login no Navegador',
  'AUTH.LOGIN_EMBEDDED': 'Login interno no LMFD',
  'AUTH.LOGIN_EMBEDDED_HINT':
    'Use este botão se o navegador externo não retornar ao LMFD após o login.',
  'AUTH.LOGGED_IN_AS': 'Conectado como',
  'AUTH.SIGN_OUT': 'Sair',
  'AUTH.REQUIRED_NOTICE':
    'Autenticação necessária para o Catálogo e Recursos de Aparelho Conectado.',

  // Seleção de Fonte (Source)
  'SOURCE.TITLE': 'SELECIONAR FONTE',
  'SOURCE.CONNECTED': 'Aparelho Conectado',
  'SOURCE.CONNECTED_VIA_ADB': 'via USB / ADB',
  'SOURCE.CATALOG': 'Catálogo de Modelos',
  'SOURCE.CATALOG_DESC': 'Busca manual por modelo',

  // Módulos / Workspaces
  'WORKSPACE.TITLE': 'MÓDULOS DE TRABALHO',
  'WORKSPACE.DOWNLOADS': 'Downloads',
  'WORKSPACE.BACKUP_RESTORE': 'Backup & Restauração',
  'WORKSPACE.APP_STORE': 'Loja de Apps',
  'WORKSPACE.ABOUT': 'Sobre o Software Fix',
  'WORKSPACE.RESCUE': 'Resgate (Rescue)',

  // Aparelho Conectado
  'CONNECTED.TITLE': 'Consulta do Aparelho',
  'CONNECTED.DESC': 'Buscar atualização ou firmware oficial para o aparelho conectado via USB',
  'CONNECTED.RUN_LOOKUP': '⚡ Consultar Atualização',
  'CONNECTED.LOOKING_UP': 'Consultando na Lenovo...',
  'CONNECTED.NO_DEVICE':
    'Nenhum aparelho detectado via ADB. Ative a Depuração USB nas opções do desenvolvedor.',
  'CONNECTED.MODEL': 'Modelo',
  'CONNECTED.IMEI': 'IMEI',
  'CONNECTED.SERIAL': 'Número de Série',
  'CONNECTED.CARRIER': 'Operadora/Canal',
  'CONNECTED.BATTERY': 'Bateria',
  'CONNECTED.HARDWARE': 'Hardware',

  // Catálogo
  'CATALOG.TITLE': 'Catálogo de Modelos',
  'CATALOG.DESC': 'Filtre modelos, selecione um e consulte firmwares oficiais',
  'CATALOG.LOAD_LOCAL': 'Carregar Local',
  'CATALOG.REFRESH': 'Atualizar da Lenovo (LMSA)',
  'CATALOG.CATEGORY': 'Categoria',
  'CATALOG.ALL': 'Todos',
  'CATALOG.PHONE': 'Smartphone',
  'CATALOG.TABLET': 'Tablet',
  'CATALOG.SMART': 'Smart',
  'CATALOG.READ_SUPPORT': 'Suporte de Leitura',
  'CATALOG.SUPPORTED': 'Suportado',
  'CATALOG.NOT_SUPPORTED': 'Não suportado',
  'CATALOG.SEARCH': 'Buscar Modelo',
  'CATALOG.SEARCH_PLACEHOLDER': 'modelo, mercado, plataforma...',
  'CATALOG.MODEL': 'Modelo',
  'CATALOG.MARKET': 'Nome de Mercado',
  'CATALOG.PLATFORM': 'Plataforma',
  'CATALOG.NO_MATCH': 'Nenhum modelo encontrado com os filtros atuais.',
  'CATALOG.PREV': '← Anterior',
  'CATALOG.NEXT': 'Próximo →',
  'CATALOG.PAGE': 'Página',
  'CATALOG.MATCHES': 'Resultados',

  // Firmware & Rescue
  'FIRMWARE.VARIANTS': 'VERSÕES DE FIRMWARE DISPONÍVEIS',
  'FIRMWARE.PUBLISHED': 'Publicado em',
  'FIRMWARE.MATCH_ID': 'ID de compatibilidade',
  'FIRMWARE.RECIPE_AVAILABLE': '✓ Receita oficial de instalação disponível',
  'FIRMWARE.RECIPE_UNAVAILABLE': '⚠ Receita indisponível (usará script/XML local)',
  'FIRMWARE.RESCUE_LITE': '⚡ RESGATE (RESCUE LITE)',
  'FIRMWARE.DRY_RUN': 'SIMULAÇÃO (DRY RUN)',
  'FIRMWARE.IN_DOWNLOADS': '✓ Em Downloads',
  'FIRMWARE.DOWNLOAD': 'Baixar Pacote',
  'FIRMWARE.DOWNLOADING': 'Baixando...',
  'FIRMWARE.COMPLETED': 'CONCLUÍDO',
  'FIRMWARE.STARTING': 'INICIANDO',
  'FIRMWARE.FAILED': 'FALHOU',
  'FIRMWARE.USE_LOCAL_ARCHIVE': 'Usar arquivo local',
  'FIRMWARE.LINKING': 'Vinculando...',
  'FIRMWARE.CANCELLING': 'Cancelando...',
  'FIRMWARE.RUNNING': 'Executando...',

  // Diálogo de Opções de Resgate
  'RESCUE.TITLE': 'Resgate de Firmware (Rescue Lite)',
  'RESCUE.DRY_RUN_TITLE': 'Simulação de Resgate (Dry Run)',
  'RESCUE.TRANSPORT': 'Modo de Conexão (Flash Transport)',
  'RESCUE.TRANSPORT_DESC': 'Selecione o protocolo compatível com o chipset do aparelho.',
  'RESCUE.DATA_RESET': 'Limpeza de Dados (Reset)',
  'RESCUE.DATA_RESET_DESC_DRY':
    'Escolha se os comandos de formatação de dados devem constar no plano.',
  'RESCUE.DATA_RESET_DESC_LIVE':
    'Escolha se a partição de dados do usuário (userdata) deve ser apagada.',
  'RESCUE.STORAGE': 'Armazenamento QDL',
  'RESCUE.BOARD_SERIAL': 'Serial da Placa (opcional)',
  'RESCUE.OPTIONAL': 'Opcional',
  'RESCUE.CANCEL': 'Cancelar',
  'RESCUE.CONTINUE': 'Continuar com Resgate',
  'RESCUE.YES': 'Sim (Restaurar de fábrica)',
  'RESCUE.NO': 'Não (Preservar dados se possível)',

  // Drivers
  'DRIVER.QUALCOMM_TITLE': 'Driver Qualcomm QDLoader HS-USB 9008',
  'DRIVER.QUALCOMM_DESC':
    'Instale o driver Qualcomm QDLoader para resgate em modo emergência (EDL/Firehose).',
  'DRIVER.UNISOC_TITLE': 'Driver Unisoc SPD USB',
  'DRIVER.UNISOC_DESC': 'Instale o driver USB Spreadtrum/Unisoc para resgate com pacotes PAC.',
  'DRIVER.MEDIATEK_TITLE': 'Driver MediaTek USB VCOM',
  'DRIVER.MEDIATEK_DESC': 'Instale o driver MediaTek USB para conexão com dispositivos MTK.',
  'DRIVER.INSTALL_BTN': 'Instalar Driver',
  'DRIVER.INSTALLED': 'Driver já instalado',
  'DRIVER.INSTALLING': 'Instalando driver...',

  // Console de Resgate
  'CONSOLE.TITLE': 'Console de Execução de Resgate',
  'CONSOLE.CANCEL': 'Interromper',
  'CONSOLE.COPY': 'Copiar Registros',
  'CONSOLE.CLEAR': 'Limpar',
  'CONSOLE.WIPE': 'Limpeza de Dados',
  'CONSOLE.TRANSPORT': 'Protocolo',

  // Downloads Panel
  'DOWNLOADS.TITLE': 'Gerenciador de Downloads',
  'DOWNLOADS.EMPTY': 'Nenhum download ativo ou concluído no momento.',
  'DOWNLOADS.OPEN_FOLDER': 'Abrir Pasta de Downloads',
  'DOWNLOADS.EXTRACT': 'Extrair',
  'DOWNLOADS.DELETE': 'Excluir',

  // Backup & Restore
  'BACKUP.TITLE': 'Backup & Restauração de Dados',
  'BACKUP.CREATE': 'Criar Novo Backup',
  'BACKUP.RESTORE': 'Restaurar Snapshot',
  'BACKUP.SNAPSHOTS': 'Snapshots Salvos',

  // App Store
  'APPSTORE.TITLE': 'Loja de Aplicativos Lenovo/Moto',
  'APPSTORE.SEARCH_PLACEHOLDER': 'Buscar aplicativo...',

  // Modais e Ações Comuns
  'COMMON.CLOSE': 'Fechar',
  'COMMON.SAVE': 'Salvar',
  'COMMON.CONFIRM': 'Confirmar',
  'COMMON.SELECT_MODULE': 'Selecione um módulo no menu lateral para começar',

  // Gerenciamento de Armazenamento
  'STORAGE.TITLE': 'Gerenciamento de Disco e ROMs',
  'STORAGE.FREE_SPACE': 'Espaço livre em disco',
  'STORAGE.PACKAGES': 'Pacotes Baixados',
  'STORAGE.EXTRACTED': 'ROMs Extraídas',
  'STORAGE.CLEAN_BTN': 'Limpar Arquivos Extraídos',
  'STORAGE.CLEAN_SUCCESS': 'Limpeza concluída! Liberados %s de espaço em disco.',
  'STORAGE.CLEAN_EMPTY': 'Nenhuma pasta extraída temporária para limpar.',

  // Verificação Prévia (Pre-flight)
  'PREFLIGHT.TITLE': 'Verificação Prévia do Dispositivo',
  'PREFLIGHT.BATTERY': 'Bateria',
  'PREFLIGHT.BATTERY_OK': 'Carga Adequada',
  'PREFLIGHT.BATTERY_LOW': 'Bateria Baixa (< 30%)',
  'PREFLIGHT.BATTERY_WARN':
    'Atenção: A bateria está com carga baixa. Conecte o carregador antes de regravar o sistema.',
  'PREFLIGHT.CONNECTED_DEVICE': 'Dispositivo Fastboot',
  'PREFLIGHT.NOT_CONNECTED': 'Nenhum celular detectado em modo Fastboot via USB.',
  'PREFLIGHT.CHECK_BTN': 'Verificar Saúde do Aparelho',

  // Permissões USB Linux (Udev)
  'UDEV.TITLE': 'Permissões USB no Linux (Regras Udev)',
  'UDEV.DESC':
    'Configure as permissões do sistema para que Fastboot, ADB e chips MediaTek/Qualcomm funcionem diretamente sem root.',
  'UDEV.STATUS_INSTALLED': 'Regras Udev instaladas e ativas',
  'UDEV.STATUS_MISSING': 'Regras Udev não configuradas',
  'UDEV.INSTALL_BTN': 'Configurar Permissões USB no Linux',
  'UDEV.INSTALL_SUCCESS': 'Regras instaladas com sucesso! Permissões USB ativadas.',

  // Relatório de Atendimento / Comprovante
  'REPORT.BTN': 'Gerar Comprovante de Serviço',
  'REPORT.TITLE': 'Comprovante de Atendimento Técnico',
  'REPORT.SUBTITLE': 'Relatório Oficial de Manutenção e Atualização de Software',
  'REPORT.PRINT': 'Imprimir / Salvar PDF',
  'REPORT.COPY': 'Copiar Dados',
  'REPORT.COPIED': 'Dados do relatório copiados com sucesso!',
  'REPORT.DATE': 'Data da Execução',
  'REPORT.DEVICE': 'Modelo do Celular',
  'REPORT.SERIAL': 'Número de Série (SN)',
  'REPORT.FIRMWARE': 'Versão de Firmware Instalada',
  'REPORT.OUTCOME': 'Status da Instalação',
  'REPORT.STATUS_SUCCESS': 'Instalação / Atualização Concluída com Êxito',
  'REPORT.DATA_PRESERVED': 'Dados do Usuário Preservados',
  'REPORT.DATA_WIPED': 'Restauração de Fábrica Realizada',
};
