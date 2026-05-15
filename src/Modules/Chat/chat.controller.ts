import { Controller, Post, Body } from '@nestjs/common';

@Controller('api/v1/chat')
export class ChatController {
  @Post()
  async chat(@Body() body: { messages: any[]; system: string }) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.GROQ_API_KEY ?? ''}`,
        } as Record<string, string>,
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: body.system },
            ...body.messages,
          ],
        }),
      });
      const data = await response.json();
      console.log('GROQ RESPONSE:', JSON.stringify(data));
      return {
        content: [{ text: data.choices?.[0]?.message?.content ?? 'No pude responder.' }],
      };
    } catch (err) {
      console.error('GROQ ERROR:', err);
      return { content: [{ text: 'Error al conectar con Groq.' }] };
    }
  }
}