export enum FeatureNameEnum {
  // Bardo
  SPELLCASTING = 'spellcasting',
  BARDIC_INSPIRATION = 'bardic_inspiration',
  JACK_OF_ALL_TRADES = 'jack_of_all_trades',
  SONG_OF_REST = 'song_of_rest',
  EXPERTISE = 'expertise',
  COUNTERCHARM = 'countercharm',
  MAGICAL_SECRETS = 'magical_secrets',
  SUPERIOR_INSPIRATION = 'superior_inspiration',

  // Bruxo
  PACT_MAGIC = 'pact_magic',
  OTHERWORLDLY_PATRON = 'otherworldly_patron',
  ELDRITCH_INVOCATIONS = 'eldritch_invocations',
  PACT_BOON = 'pact_boon',
  MYSTIC_ARCANUM = 'mystic_arcanum',
  ELDRITCH_MASTER = 'eldritch_master',

  // Adicione conforme necessário...
}

export type FeatureNameType = `${FeatureNameEnum}`;
