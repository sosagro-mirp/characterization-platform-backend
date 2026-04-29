import { PartialType } from '@nestjs/swagger';
import { CreateOptionQuestionDto } from './create-option-question.dto';

export class UpdateOptionQuestionDto extends PartialType(
  CreateOptionQuestionDto,
) {}
