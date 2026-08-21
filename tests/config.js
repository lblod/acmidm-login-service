const TEST_GRAPH_ROOT = 'http://mu.semte.ch/graphs/acmidm-login-service-tests/';

const organisations = {
  affligem: {
    code: '0207509031',
    name: 'Gemeente Affligem',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:0207509031'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-affligem-rrn',
      sub: 'mock-affligem-subject',
      vo_doelgroepcode: 'LB',
      vo_doelgroepnaam: 'Lokale Besturen',
      vo_email: 'mock-affligem@example.test',
      vo_id: 'mock-affligem-account-id',
      vo_orgcode: '0207509031',
      vo_orgnaam: 'Gemeente Affligem'
    }
  },
  sanoRice: {
    code: '0426994097',
    name: 'SanoRice Belgium',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:0426994097'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-sanorice-rrn',
      sub: 'mock-sanorice-subject',
      vo_doelgroepcode: 'EA',
      vo_doelgroepnaam: 'Economische Actoren',
      vo_email: 'mock-sanorice@example.test',
      vo_id: 'mock-sanorice-account-id',
      vo_orgcode: '0426994097',
      vo_orgnaam: 'SanoRice Belgium'
    }
  },
  apotheekDeLinde: {
    code: '0423968786',
    name: '"APOTHEEK DE LINDE"',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:0423968786'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-apotheek-de-linde-rrn',
      sub: 'mock-apotheek-de-linde-subject',
      vo_doelgroepcode: 'EA',
      vo_doelgroepnaam: 'Economische Actoren',
      vo_email: 'mock-apotheek-de-linde@example.test',
      vo_id: 'mock-apotheek-de-linde-account-id',
      vo_orgcode: '0423968786',
      vo_orgnaam: '"APOTHEEK DE LINDE"'
    }
  },
  missingEconomicActor: {
    code: '9999000001',
    name: 'Mock Missing Economic Actor',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:9999000001'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-missing-economic-actor-rrn',
      sub: 'mock-missing-economic-actor-subject',
      vo_doelgroepcode: 'EA',
      vo_doelgroepnaam: 'Economische Actoren',
      vo_email: 'mock-missing-economic-actor@example.test',
      vo_id: 'mock-missing-economic-actor-account-id',
      vo_orgcode: '9999000001',
      vo_orgnaam: 'Mock Missing Economic Actor'
    }
  },
  missingEconomicActorWithoutAccountId: {
    code: '9999000004',
    name: 'Mock Economic Actor Without Account ID',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:9999000004'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-missing-economic-actor-without-account-id-rrn',
      sub: 'mock-missing-economic-actor-without-account-id-subject',
      vo_doelgroepcode: 'EA',
      vo_doelgroepnaam: 'Economische Actoren',
      vo_email: 'mock-missing-economic-actor-without-account-id@example.test',
      vo_orgcode: '9999000004',
      vo_orgnaam: 'Mock Economic Actor Without Account ID'
    }
  },
  missingNonEconomicActor: {
    code: '9999000002',
    name: 'Mock Missing Non-economic Actor',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:9999000002'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-missing-non-economic-actor-rrn',
      sub: 'mock-missing-non-economic-actor-subject',
      vo_doelgroepcode: 'LB',
      vo_doelgroepnaam: 'Lokale Besturen',
      vo_email: 'mock-missing-non-economic-actor@example.test',
      vo_id: 'mock-missing-non-economic-actor-account-id',
      vo_orgcode: '9999000002',
      vo_orgnaam: 'Mock Missing Non-economic Actor'
    }
  },
  missingBestuurseenheid: {
    code: '9999000003',
    name: 'Mock Missing Bestuurseenheid',
    claims: {
      abb_subsidiepunt_rol_2d: ['SubsidiepuntGebruiker:9999000003'],
      amr: ['mfa'],
      family_name: 'Mock Family Name',
      given_name: 'Mock Given Name',
      rrn: 'mock-missing-bestuurseenheid-rrn',
      sub: 'mock-missing-bestuurseenheid-subject',
      vo_doelgroepcode: 'LB',
      vo_doelgroepnaam: 'Lokale Besturen',
      vo_email: 'mock-missing-bestuurseenheid@example.test',
      vo_id: 'mock-missing-bestuurseenheid-account-id',
      vo_orgcode: '9999000003',
      vo_orgnaam: 'Mock Missing Bestuurseenheid'
    }
  }
};

module.exports = {
  TEST_GRAPH_ROOT,
  organisations
};
