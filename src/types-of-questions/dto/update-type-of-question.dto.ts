import { PartialType } from '@nestjs/swagger';
import { CreateTypeOfQuestionDto } from './create-type-of-question.dto';

export class UpdateTypeOfQuestionDto extends PartialType(
  CreateTypeOfQuestionDto,
) {}
