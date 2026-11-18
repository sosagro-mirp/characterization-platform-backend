import {
  explainIneligibility,
  privateOnlyReason,
  questionTypeLabel,
} from './dashboard-privacy.config';

describe('explainIneligibility (spec 109)', () => {
  it('una pregunta elegible no tiene motivo', () => {
    expect(
      explainIneligibility({ text: 'Tipo de vía', typeName: 'single_choice' }),
    ).toBeNull();
  });

  it('la privacidad pesa más que el tipo: campo denegado en texto abierto', () => {
    const reason = explainIneligibility({
      text: 'Número de documento',
      typeName: 'open_text',
      systemField: 'farmer.documentId',
    });
    expect(reason).toMatch(/^Identifica al productor/);
  });

  it('un texto identificante en un tipo excluido también muestra el motivo de privacidad', () => {
    const reason = explainIneligibility({
      text: 'Nombre completo del encuestado',
      typeName: 'open_text',
    });
    expect(reason).toMatch(/^Identifica al productor|^Tipo no graficable/);
  });

  it('un tipo excluido sin datos identificantes dice «Tipo no graficable» en español', () => {
    const reason = explainIneligibility({
      text: 'Comentarios generales',
      typeName: 'open_text',
    });
    expect(reason).toBe(
      'Tipo no graficable: las preguntas de texto abierto no se pueden graficar.',
    );
  });

  it.each([
    ['image', 'imagen'],
    ['voice_recording', 'grabación de voz'],
    ['document', 'documento'],
    ['video', 'video'],
  ])('traduce el tipo excluido %s', (type, label) => {
    expect(questionTypeLabel(type)).toBe(label);
  });

  it('sin tipo cargado lo dice', () => {
    expect(explainIneligibility({ text: 'x', typeName: null })).toBe(
      'La pregunta no tiene tipo cargado.',
    );
  });
});

describe('privateOnlyReason (spec 109, Fase 6)', () => {
  it.each([
    '¿Pertenece el productor a alguno de los siguientes grupos o territorios? (Puede marcar más de una opción)',
    'Área total del predio',
    'Área cultivada con las cadenas del proyecto',
    'Hectáreas totales del predio',
    'Hectáreas actualmente cultivadas con las cadenas del proyecto (ha)',
    '¿Cuál es el área del predio que está actualmente cultivada?',
  ])('«%s» solo admite audiencia privada', (text) => {
    expect(privateOnlyReason({ text })).toMatch(/^Dato sensible/);
  });

  it('la clave farm.area también, aunque cambie el texto', () => {
    expect(
      privateOnlyReason({ text: 'Tamaño', systemField: 'farm.area' }),
    ).toMatch(/^Dato sensible/);
  });

  it.each([
    'Hectáreas sembradas en café (ha)',
    '¿Cuántos kilos de café pergamino seco cosecha por hectárea al año?',
    '¿Qué áreas requieren mayor fortalecimiento?',
    '¿Pertenece a alguna federación, asociación, cooperativa o gremio?',
    'Género del productor(a)',
  ])('«%s» se puede publicar', (text) => {
    expect(privateOnlyReason({ text })).toBeNull();
  });
});
