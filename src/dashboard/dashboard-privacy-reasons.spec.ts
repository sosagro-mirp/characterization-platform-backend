import {
  explainIneligibility,
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
