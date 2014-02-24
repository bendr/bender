//
//  Element.m
//  Bender
//
//  Created by Julien Quint on 2/24/14.
//  Copyright (c) 2014 IGEL, Co., Ltd. All rights reserved.
//

#import "Element.h"

@implementation Element

- (View *)view {
    return self.parent ? ((Element *)self.parent).view : nil;
}

@end


@implementation View

- (View *)view {
    return self;
}

@end
