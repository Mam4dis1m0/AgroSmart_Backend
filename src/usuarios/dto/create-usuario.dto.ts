export class CreateUsuarioDto {
  primerNombre: string;
  segundoNombre?: string;
  primerApellido: string;
  segundoApellido?: string;
  email: string;
  contrasena: string;
  telefono?: string;
}