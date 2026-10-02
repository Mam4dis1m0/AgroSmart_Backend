import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { CurrentUser, Roles, SinFinca } from '../../auth/auth.decorators';
import { AuthUser, TenantContext } from '../../auth/tenant-context';
import {
  CarritoItemDto,
  CatalogoQueryDto,
  CreateListadoDto,
  CreateOrdenDto,
  FotoListadoDto,
  UpdateListadoDto,
  WishlistItemDto,
} from '../../dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

/**
 * Marketplace MarketFields.
 *  · Catálogo: cualquier usuario autenticado (comprador, administrador, empleado) — datos públicos.
 *  · Vender / gestionar ventas: administrador de finca.
 *  · Comprar / mis compras: comprador externo.
 * Las rutas del comprador son @SinFinca: no pertenece a ninguna finca (RNF-20).
 */
@Controller('api/v1/marketplace')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class MarketplaceController {
  constructor(private readonly service: MarketplaceService) {}

  // ── Catálogo (MERCADO) ────────────────────────────────────────────────────
  @Get('listados')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  catalogo(@Query() query: CatalogoQueryDto, @CurrentUser() user: AuthUser) {
    return this.service.catalogo(query, user);
  }

  // ── Vender (VENDER) ───────────────────────────────────────────────────────
  // Rutas fijas ANTES de ':id' para que no se interpreten como un id
  @Get('listados/mios')
  @Roles('admin')
  misListados() {
    return this.service.misListados(TenantContext.requireFinca());
  }

  @Post('fotos')
  @Roles('admin')
  subirFoto(@Body() dto: FotoListadoDto) {
    return this.service.subirFoto(TenantContext.requireFinca(), dto.imagen);
  }

  @Post('listados')
  @Roles('admin')
  crearListado(@Body() dto: CreateListadoDto, @CurrentUser() user: AuthUser) {
    return this.service.crearListado(dto, user, TenantContext.requireFinca());
  }

  @Get('listados/:id')
  @Roles('admin', 'empleado', 'comprador')
  @SinFinca()
  detalle(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.detalle(id, user);
  }

  @Put('listados/:id')
  @Roles('admin')
  actualizarListado(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateListadoDto) {
    return this.service.actualizarListado(id, dto, TenantContext.requireFinca());
  }

  @Delete('listados/:id')
  @Roles('admin')
  eliminarListado(@Param('id', ParseIntPipe) id: number) {
    return this.service.eliminarListado(id, TenantContext.requireFinca());
  }

  // CREAR LISTADO DESTACADO (Upsell)
  @Post('listados/:id/destacar')
  @Roles('admin')
  destacar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.destacar(id, user, TenantContext.requireFinca());
  }

  // ── Órdenes de compra ─────────────────────────────────────────────────────
  @Post('ordenes')
  @Roles('comprador')
  @SinFinca()
  crearOrden(@Body() dto: CreateOrdenDto, @CurrentUser() user: AuthUser) {
    return this.service.crearOrden(dto, user);
  }

  @Get('ordenes/mis-compras')
  @Roles('comprador')
  @SinFinca()
  misCompras(@CurrentUser() user: AuthUser) {
    return this.service.misCompras(user);
  }

  @Get('ordenes/ventas')
  @Roles('admin')
  ventas() {
    return this.service.ventas(TenantContext.requireFinca());
  }

  @Patch('ordenes/:id/aceptar')
  @Roles('admin')
  aceptar(@Param('id', ParseIntPipe) id: number) {
    return this.service.aceptarOrden(id, TenantContext.requireFinca());
  }

  @Patch('ordenes/:id/rechazar')
  @Roles('admin')
  rechazar(@Param('id', ParseIntPipe) id: number) {
    return this.service.rechazarOrden(id, TenantContext.requireFinca());
  }

  @Patch('ordenes/:id/cerrar')
  @Roles('admin')
  cerrar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.cerrarOrden(id, TenantContext.requireFinca(), user);
  }

  // Comprador (suyas) o vendedor (las que ya aceptó)
  @Patch('ordenes/:id/cancelar')
  @Roles('admin', 'comprador')
  @SinFinca()
  cancelar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.cancelarOrden(id, user);
  }

  // ── Carrito y wishlist (Premium) ──────────────────────────────────────────
  @Get('carrito')
  @Roles('admin', 'comprador')
  @SinFinca()
  verCarrito(@CurrentUser() user: AuthUser) {
    return this.service.verCarrito(user);
  }

  @Put('carrito')
  @Roles('admin', 'comprador')
  @SinFinca()
  guardarEnCarrito(@Body() dto: CarritoItemDto, @CurrentUser() user: AuthUser) {
    return this.service.guardarEnCarrito(dto, user);
  }

  @Post('carrito/ordenar')
  @Roles('comprador')
  @SinFinca()
  ordenarCarrito(@CurrentUser() user: AuthUser) {
    return this.service.ordenarCarrito(user);
  }

  @Delete('carrito/:idlistado')
  @Roles('admin', 'comprador')
  @SinFinca()
  quitarDelCarrito(@Param('idlistado', ParseIntPipe) idlistado: number, @CurrentUser() user: AuthUser) {
    return this.service.quitarDelCarrito(idlistado, user);
  }

  @Get('wishlist')
  @Roles('admin', 'comprador')
  @SinFinca()
  verWishlist(@CurrentUser() user: AuthUser) {
    return this.service.verWishlist(user);
  }

  @Post('wishlist')
  @Roles('admin', 'comprador')
  @SinFinca()
  guardarEnWishlist(@Body() dto: WishlistItemDto, @CurrentUser() user: AuthUser) {
    return this.service.guardarEnWishlist(dto.idlistado, user);
  }

  @Delete('wishlist/:idlistado')
  @Roles('admin', 'comprador')
  @SinFinca()
  quitarDeWishlist(@Param('idlistado', ParseIntPipe) idlistado: number, @CurrentUser() user: AuthUser) {
    return this.service.quitarDeWishlist(idlistado, user);
  }
}
