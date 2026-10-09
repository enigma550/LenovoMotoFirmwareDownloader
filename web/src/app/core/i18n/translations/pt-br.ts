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

  // Atualização do Projeto
  'UPDATE.TITLE': 'Atualizar Projeto',
  'UPDATE.BUTTON': 'Atualizar',
  'UPDATE.AVAILABLE_BADGE': 'Atualizações disponíveis',
  'UPDATE.MODE_SOURCE': 'Instalação via código-fonte (git)',
  'UPDATE.MODE_PACKAGED': 'Aplicativo instalado',
  'UPDATE.CLOSE': 'Fechar',
  'UPDATE.CHECKING': 'Verificando atualizações...',
  'UPDATE.CREDENTIALS_OK': 'Credenciais OK',
  'UPDATE.CREDENTIALS_AUTH_FAILED': 'Acesso negado',
  'UPDATE.CREDENTIALS_NETWORK_FAILED': 'Problema de rede',
  'UPDATE.CREDENTIALS_MISSING_REMOTE': 'Remoto ausente',
  'UPDATE.CREDENTIALS_NOT_APPLICABLE': 'Canal de release',
  'UPDATE.CREDENTIALS_UNKNOWN': 'Não verificado',
  'UPDATE.NO_UPDATES': 'Seu projeto está atualizado.',
  'UPDATE.INCOMING_COMMITS': 'Atualizações recebidas',
  'UPDATE.DIRTY_FILES': 'Alterações locais não commitadas',
  'UPDATE.BACKUP_OPTION': 'Fazer backup das alterações locais (git stash) antes de atualizar',
  'UPDATE.RUNNING': 'Atualizando...',
  'UPDATE.RESTART_HINT': 'Atualização concluída. Reinicie o aplicativo para usar a nova versão.',
  'UPDATE.LOG_TITLE': 'Log de operações',
  'UPDATE.REFRESH': 'Verificar novamente',
  'UPDATE.OPEN_LOG': 'Ver log',
  'UPDATE.HIDE_LOG': 'Ocultar log',
  'UPDATE.CANCEL': 'Cancelar',
  'UPDATE.CANCELING': 'Cancelando...',
  'UPDATE.START': 'Atualizar agora',
  'UPDATE.HINT.NOT_A_SOURCE_CHECKOUT':
    'Esta instalação é gerenciada por releases; as atualizações são aplicadas automaticamente.',
  'UPDATE.HINT.GIT_MISSING': 'Instale o git para habilitar atualizações via código-fonte.',
  'UPDATE.HINT.AUTH_FAILED':
    'Configure as credenciais git do repositório remoto (token HTTPS ou chave SSH) e tente novamente.',
  'UPDATE.HINT.NETWORK_FAILED': 'Verifique sua conexão com a internet e tente novamente.',
  'UPDATE.HINT.MISSING_REMOTE': 'O repositório não possui o remoto "origin" configurado.',
  'UPDATE.HINT.DIRTY_TREE':
    'Faça commit ou stash das suas alterações locais, ou ative a opção de backup.',
  'UPDATE.HINT.DIVERGED':
    'Sua branch local tem commits exclusivos. Faça merge ou rebase com origin/main manualmente.',
  'UPDATE.HINT.NOTHING_TO_UPDATE': 'Tudo já está atualizado.',
  'UPDATE.HINT.UPDATE_IN_PROGRESS': 'Aguarde a atualização em execução terminar.',
  'UPDATE.HINT.UPDATE_NOT_AVAILABLE': 'Nenhuma nova release disponível.',
  'UPDATE.HINT.MERGE_FAILED':
    'A atualização não pôde ser aplicada. Nada foi perdido — verifique o log.',
  'UPDATE.HINT.DEPENDENCY_FAILED':
    'Falha ao instalar dependências. Verifique o log e rode "bun install" manualmente.',
  'UPDATE.HINT.BUILD_FAILED':
    'Falha ao buildar a interface. Seus arquivos anteriores estão intactos — verifique o log.',
  'UPDATE.HINT.CANCELED': 'A atualização foi cancelada.',
  'UPDATE.HINT.UNKNOWN': 'Erro inesperado. Verifique o log de operações.',

  // Comum
  'COMMON.COPY': 'Copiar',
  'COMMON.COPIED': 'Copiado',
  'COMMON.COPY_FAILED': 'Falha ao copiar',
  'COMMON.DISMISS': 'Dispensar',

  // Modal de integração desktop
  'PROMPT.TITLE': 'Integração com a área de trabalho',
  'PROMPT.WINDOWS_TITLE': 'Aplicativo Padrão (Windows)',
  'PROMPT.SHORTCUT_TITLE': 'Atalho na Área de Trabalho',
  'PROMPT.WINDOWS_DESC_1': 'O Windows permite apenas um manipulador para ',
  'PROMPT.WINDOWS_DESC_2':
    '. Deixe o LMFD registrar esse protocolo para este usuário do Windows se quiser que os callbacks de login Lenovo retornem para cá.',
  'PROMPT.WINDOWS_DESC_3': 'Você pode reverter isso na aba Sobre mais tarde.',
  'PROMPT.WMCLASS_DESC_1':
    'Foi encontrado um atalho de área de trabalho existente, mas com uma configuração de classe de janela incorreta. Isso pode fazer o aplicativo não se agrupar corretamente na dock e na barra de tarefas.',
  'PROMPT.WMCLASS_DESC_2': 'Deseja corrigir?',
  'PROMPT.SHORTCUT_DESC_1': 'Parece que você não tem um atalho de área de trabalho configurado.',
  'PROMPT.SHORTCUT_DESC_2':
    'Deseja criar um para que o aplicativo apareça corretamente no iniciador e na dock?',
  'PROMPT.DONT_ASK': 'Não perguntar novamente',
  'PROMPT.NOT_NOW': 'Agora não',
  'PROMPT.SWITCHING': 'Alternando...',
  'PROMPT.FIXING': 'Corrigindo...',
  'PROMPT.CREATING': 'Criando...',
  'PROMPT.SWITCH_TO_LMFD': 'Alternar para o LMFD',
  'PROMPT.FIX_IT': 'Corrigir',
  'PROMPT.CREATE': 'Criar',

  // Rótulos extras de relatório e backup
  'REPORT.METHOD': 'Método',
  'REPORT.USER_DATA': 'Dados do Usuário',
  'REPORT.STATUS_FAILED': 'Falha / Não Concluído',
  'BACKUP.DELETE_SNAPSHOT': 'Excluir snapshot',
  'FIRMWARE.DRY_RUN_PROGRESS': 'Simulação em execução...',

  // Diálogo de confirmação
  'COMMON.CANCEL': 'Cancelar',
  'COMMON.CANNOT_UNDO': 'Esta ação não pode ser desfeita.',
  'ERRORS.LABEL': 'Erro:',
  'ERRORS.REQUEST_FAILED': 'A solicitação falhou.',
  'THEME.SWITCHED_DARK': 'Alternado para modo escuro.',
  'THEME.SWITCHED_LIGHT': 'Alternado para modo claro.',

  // Sobre / udev / atualização do framework
  'ABOUT.UDEV_SUCCESS': 'Regras Udev instaladas com sucesso! Permissões USB ativadas.',
  'ABOUT.UDEV_ERROR': 'Falha ao instalar regras Udev.',
  'ABOUT.UPDATE_CHECK_DISABLED':
    'Verificações de atualização desativadas para desenvolvimento local.',
  'ABOUT.LATEST_VERSION': 'Você está na versão mais recente.',
  'ABOUT.UPDATE_AUTO_UNAVAILABLE':
    'Atualização automática indisponível para esta build. Abrindo a página de download...',
  'ABOUT.DOWNLOADING_UPDATE': 'Baixando atualização...',
  'ABOUT.UPDATE_DOWNLOADED': 'Atualização baixada. Aplicando...',
  'ABOUT.UPDATE_FAILED': 'Falha na atualização:',

  // Barra de seleção
  'TOOLBAR.SELECT_ALL': 'Selecionar tudo',
  'TOOLBAR.CLEAR_ALL': 'Limpar tudo',
  'TOOLBAR.SELECT_PAGE': 'Selecionar página',
  'TOOLBAR.CLEAR_PAGE': 'Limpar página',
  'TOOLBAR.PREV': 'Anterior',
  'TOOLBAR.NEXT': 'Próxima',
  'TOOLBAR.PAGE': 'Página',

  // Árvore de arquivos do backup
  'BACKUP.NO_FILES': 'Nenhum arquivo encontrado.',
  'BACKUP.EXPAND_ALL': 'Expandir tudo',
  'BACKUP.COLLAPSE_ALL': 'Recolher tudo',
  'BACKUP.FILE_ONE': 'arquivo',
  'BACKUP.FILE_MANY': 'arquivos',
  'BACKUP.UNKNOWN_PACKAGE': 'Pacote desconhecido',
  'BACKUP.NO_CATEGORIES': 'Nenhuma categoria detectada',
  'BACKUP.RESTORE_DONE': 'Restauração concluída',
  'BACKUP.RESTORE_PARTIAL': 'Restauração finalizada com falhas',
  'BACKUP.CONSOLE_TITLE': 'Console de Backup/Restauração',

  // App Store
  'APPSTORE.SEARCH_AURORA': 'Buscar pacotes Aurora',
  'APPSTORE.SEARCH_QUERY': 'Termo de busca',
  'APPSTORE.SEARCH_BTN': 'Buscar',
  'APPSTORE.TARGET_ARCH': 'Arquitetura alvo',
  'APPSTORE.SEARCH_EMPTY': 'Os resultados da busca aparecerão aqui.',
  'APPSTORE.SELECTED': 'Selecionado',
  'APPSTORE.SELECTED_APP': 'App Selecionado',
  'APPSTORE.CHOOSE_RESULT': 'Escolha um resultado',
  'APPSTORE.PICK_RESULT': 'Escolha um resultado da busca para baixar.',
  'APPSTORE.UNKNOWN_VERSION': 'Versão desconhecida',

  // Rótulos de Downloads / Rescue (i18n residual)
  'STATUS.IDLE': 'Ocioso',
  'COMMON.YES': 'Sim',
  'COMMON.NO': 'Não',
  'DOWNLOADS.CANCELLING': 'Cancelando...',
  'DOWNLOADS.EXEC_DRY_RUN': 'Simulação',
  'DOWNLOADS.EXEC_LIVE': 'Flash real',
  'DOWNLOADS.LABEL_DOWNLOAD': 'Download',
  'DOWNLOADS.LABEL_RESCUE': 'Rescue',
  'DOWNLOADS.COMPLETED': 'Download concluído.',
  'DOWNLOADS.RESCUE_COMPLETED': 'Rescue concluído.',
  'DOWNLOADS.RESCUE_DRY_COMPLETED': 'Simulação de rescue concluída.',
  'DOWNLOADS.CANCELED': 'Download cancelado.',
  'DOWNLOADS.RESCUE_CANCELED': 'Rescue cancelado.',
  'DOWNLOADS.CANCELING_DOWNLOAD': 'Cancelando download...',
  'DOWNLOADS.CANCELING_RESCUE': 'Cancelando rescue...',
  'DOWNLOADS.ALREADY_RUNNING': 'Outra operação Rescue Lite já está em execução.',
  'DOWNLOADS.RESCUE_ALREADY_RUNNING': 'Rescue Lite já em execução.',
  'DOWNLOADS.SKIPPED_EXISTS_MSG': 'Download ignorado. O arquivo já existe: {name}',
  'DOWNLOADS.SKIPPED_EXISTS_STATUS': 'Download ignorado (já existe).',
  'DOWNLOADS.ALREADY_DOWNLOADED': 'Já baixado: {name}. Use o arquivo local em Downloads.',
  'DOWNLOADS.RESCUE_RUNNING': 'Rescue Lite: Iniciando download do pacote de firmware...',
  'DOWNLOADS.RESCUE_STARTED':
    'Rescue Lite iniciado ({name}) | Reset de dados: {wipe} | Transporte: {transport}',
  'DOWNLOADS.RESCUE_STARTED_DRY':
    'Rescue Lite (Simulação) iniciado ({name}) | Reset de dados: {wipe} | Transporte: {transport}',
  'DOWNLOADS.STARTING': 'Iniciando download: {name}',
  'DOWNLOADS.STARTING_STATUS': 'Iniciando download...',
  'DOWNLOADS.EXTRACTION_CANCELED_STATUS': 'Extração cancelada.',
  'DOWNLOADS.EXTRACTION_CANCELED': 'Extração cancelada: {name}',
  'DOWNLOADS.CANCELED_WITH_NAME': '{label} cancelado: {name}.',
  'DOWNLOADS.CANCELED_WITH_NAME_TOAST': '{label} cancelado: {name}',
  'DOWNLOADS.REMOVE_TITLE': 'Remover download?',
  'DOWNLOADS.REMOVE_MESSAGE':
    'Tem certeza de que deseja remover {name} do seu armazenamento local? Isso excluirá o arquivo e todos os metadados associados.',
  'TRANSPORT.FASTBOOT': 'Fastboot',
  'TRANSPORT.QDL': 'QDL (EDL/Firehose)',
  'TRANSPORT.UNISOC': 'Unisoc PAC',
  'TRANSPORT.MEDIATEK': 'MediaTek',
  'RESCUE.DIALOG_DESC':
    'O Rescue Lite executa comandos de rescue de firmware do pacote selecionado.',
  'RESCUE.DIALOG_DESC_DRY':
    'A simulação apenas analisa os comandos de rescue e imprime a sequência planejada. Nenhum flash é executado.',
};
