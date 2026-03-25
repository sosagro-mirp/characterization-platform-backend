import { PartialType } from '@nestjs/mapped-types';
import { CreateTypeOfQuestionDto } from './create-type-of-question.dto';

export class UpdateTypeOfQuestionDto extends PartialType(
  CreateTypeOfQuestionDto,
) {}