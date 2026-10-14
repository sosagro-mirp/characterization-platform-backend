import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Spec 94 — `POST /farms/:id/crops`. */
export class AddFarmCropDto {
  /** UUID del tipo de cultivo (catálogo `types_of_crops`) a sumar a la finca */
  @ApiProperty({
    format: 'uuid',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsUUID()
  cropId: string;
}
