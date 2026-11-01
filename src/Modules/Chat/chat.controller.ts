import { Controller, Post, Body } from '@nestjs/common';
import { RequiereFuncion } from '../../auth/auth.decorators';

// RF-44: el asistente de IA es una función Premium (el PlanGuard valida el plan de la finca activa)
@Controller('api/v1/chat')
@RequiereFuncion('chat_ia')
export class ChatController {
  @Post()
  async chat(@Body() body: { messages: any[]; system: string }) {
    try {
      const response = await fetch(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
          } as Record<string, string>,
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            max_tokens: 1000,
            messages: [
              { role: 'system', content: body.system },
              ...body.messages,
            ],
          }),
        },
      );
      const data = await response.json();
      console.log('GROQ RESPONSE:', JSON.stringify(data));
      return {
        content: [
          { text: data.choices?.[0]?.message?.content ?? 'No pude responder.' },
        ],
      };
    } catch (err) {
      console.error('GROQ ERROR:', err);
      return { content: [{ text: 'Error al conectar con Groq.' }] };
    }
  }
  /** Prepara operaciones como borrador; no modifica la base de datos. */
  @Post('planificar')
  async planificar(@Body() body: { solicitud: string; contexto?: any }) {
    const system = `Eres el planificador de operaciones de AgroSmart. Responde SOLO JSON válido con forma:
{"mensaje":"texto","faltantes":["dato"],"acciones":[{"tipo":"lote|cultivo|tarea","datos":{}}]}
Campos lote: nombre, areahectareas (número), ubicacion, descripcion.
Campos cultivo: tipo, categoria, fechasiembra (YYYY-MM-DD), fechacosechaestimada (YYYY-MM-DD), idlote_ref:"lote" para enlazar con el lote creado antes.
Campos tarea: tipoactividad, fechaprogramada (YYYY-MM-DD), tiempototaltarea (número minutos), costototal, costotransporte, cultivo_ref:"cultivo" para enlazar con cultivo creado antes.
No inventes IDs, finca, usuarios ni fechas/datos imprescindibles. Si falta un dato imprescindible, ponlo en faltantes y no inventes el valor. No incluyas IDs de sesión. No generes ediciones ni borrados. Para consultas sin operaciones usa acciones: [].`;
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.GROQ_API_KEY ?? ''}` },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', max_tokens: 1200, response_format: { type: 'json_object' }, messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ solicitud: body.solicitud, contexto: body.contexto ?? {} }) },
        ] }),
      });
      const data = await response.json();
      if (!response.ok) return { mensaje: 'No pude preparar las operaciones. Intenta nuevamente.', faltantes: [], acciones: [] };
      const plan = JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
      const permitidos = ['lote', 'cultivo', 'tarea'];
      const acciones = Array.isArray(plan.acciones) ? plan.acciones.filter((a: any) => a && permitidos.includes(a.tipo) && a.datos && typeof a.datos === 'object').slice(0, 12) : [];
      return { mensaje: typeof plan.mensaje === 'string' ? plan.mensaje : 'Revisa la propuesta.', faltantes: Array.isArray(plan.faltantes) ? plan.faltantes.filter((x: any) => typeof x === 'string').slice(0, 12) : [], acciones };
    } catch (error) {
      console.error('GROQ PLAN ERROR:', error);
      return { mensaje: 'No pude interpretar la solicitud. Intenta explicarla de otra manera.', faltantes: [], acciones: [] };
    }
  }

}
