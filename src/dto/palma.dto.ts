import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreatePalmaDto {
  @IsString() @IsOptional() codigo?: string;
  @IsString() @IsOptional() variedad?: string;
  @IsString() @IsOptional() fechasiembra?: string;
  @IsString() @IsOptional() estadosanitario?: string;
  @IsString() @IsOptional() observaciones?: string;
  @IsNumber() @IsOptional() idlote?: number;
}

export class UpdatePalmaDto extends CreatePalmaDto {}